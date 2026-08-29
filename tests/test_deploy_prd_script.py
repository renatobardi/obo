import hashlib
import os
import subprocess
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "scripts" / "deploy-prd.sh"
HOST_SCRIPT = Path(__file__).parents[1] / "scripts" / "deploy-prd-host.sh"
ARTIFACT = f"ghcr.io/renatobardi/obo:prd-{'a' * 40}@sha256:{'b' * 64}"
COMPOSE_COMMAND = (
    "compose --env-file /etc/obo/prd.env -f docker-compose.yml "
    "-f deploy/docker-compose.prd.yml -p obo "
    "up -d --no-deps --force-recreate --no-build obo"
)


def make_fake_commands(tmp_path: Path) -> tuple[Path, Path]:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    log = tmp_path / "commands.log"
    docker = bin_dir / "docker"
    docker.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$COMMAND_LOG"
if [[ "$*" == "inspect -f {{.Image}} obo-obo-1" ]]; then
  if [[ -f "$COMMAND_STATE" ]]; then echo "${RUNNING_IMAGE:-sha256:new}"; else echo sha256:previous; fi
elif [[ "$*" == "image inspect "*" --format {{.Architecture}}" ]]; then
  echo "${IMAGE_ARCHITECTURE:-arm64}"
elif [[ "$*" == "image inspect -f {{.Id}} "* ]]; then
  echo sha256:new
elif [[ "$*" == "tag sha256:previous "* ]]; then
  rm -f "$COMMAND_STATE"
elif [[ "$*" == "tag ghcr.io/"* ]]; then
  touch "$COMMAND_STATE"
elif [[ "$*" == "exec obo-obo-1 curl -fsS http://127.0.0.1:5055/health" ]]; then
  exit "${INTERNAL_HEALTH_EXIT:-0}"
fi
"""
    )
    curl = bin_dir / "curl"
    curl.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$COMMAND_LOG"
[[ "${PUBLIC_HEALTH:-success}" == success ]]
"""
    )
    sleep = bin_dir / "sleep"
    sleep.write_text("#!/usr/bin/env bash\nexit 0\n")
    for command in (docker, curl, sleep):
        command.chmod(0o755)
    return bin_dir, log


def run_deploy(
    bin_dir: Path,
    log: Path,
    public_health: str = "success",
    architecture: str = "arm64",
    running_image: str = "sha256:new",
    artifact: str = ARTIFACT,
) -> subprocess.CompletedProcess[str]:
    env = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "COMMAND_LOG": str(log),
        "COMMAND_STATE": str(bin_dir.parent / "deployed"),
        "COMPOSE_DIR": str(bin_dir.parent),
        "IMAGE_ARCHITECTURE": architecture,
        "PUBLIC_HEALTH": public_health,
        "RUNNING_IMAGE": running_image,
    }
    return subprocess.run(
        ["bash", str(SCRIPT), artifact],
        capture_output=True,
        env=env,
        text=True,
    )


def test_deploys_arm64_image_and_checks_internal_and_public_health(tmp_path: Path) -> None:
    bin_dir, log = make_fake_commands(tmp_path)

    result = run_deploy(bin_dir, log)

    assert result.returncode == 0, result.stderr
    commands = log.read_text()
    assert f"pull {ARTIFACT}" in commands
    assert f"image inspect {ARTIFACT} --format {{{{.Architecture}}}}" in commands
    assert COMPOSE_COMMAND in commands
    assert "exec obo-obo-1 curl -fsS http://127.0.0.1:5055/health" in commands
    assert "-fsS https://obo.oute.pro/api/auth/status" in commands
    assert "-fsS https://obo.oute.pro/login" in commands


def test_rejects_untrusted_image_reference_before_docker_commands(tmp_path: Path) -> None:
    bin_dir, log = make_fake_commands(tmp_path)

    result = run_deploy(bin_dir, log, artifact="--help")

    assert result.returncode != 0
    assert not log.exists()


def test_rejects_non_arm64_image_before_recreating_service(tmp_path: Path) -> None:
    bin_dir, log = make_fake_commands(tmp_path)

    result = run_deploy(bin_dir, log, architecture="amd64")

    assert result.returncode != 0
    assert "force-recreate" not in log.read_text()


def test_rolls_back_when_compose_uses_a_different_image(tmp_path: Path) -> None:
    bin_dir, log = make_fake_commands(tmp_path)

    result = run_deploy(bin_dir, log, running_image="sha256:wrong")

    assert result.returncode != 0
    commands = log.read_text()
    assert "tag sha256:previous obo-prd-firebase:latest" in commands
    assert commands.count(COMPOSE_COMMAND) == 2


def test_rolls_back_when_public_health_check_fails(tmp_path: Path) -> None:
    bin_dir, log = make_fake_commands(tmp_path)

    result = run_deploy(bin_dir, log, public_health="failure")

    assert result.returncode != 0
    commands = log.read_text()
    assert "tag sha256:previous obo-prd-firebase:latest" in commands
    assert commands.count(COMPOSE_COMMAND) == 2


def test_host_wrapper_accepts_only_matching_versioned_input(tmp_path: Path) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    log = tmp_path / "lxc.log"
    lxc = bin_dir / "lxc"
    lxc.write_text('#!/usr/bin/env bash\nprintf "%s\\n" "$*" > "$LXC_LOG"\n')
    lxc.chmod(0o755)
    wrapper_sha = hashlib.sha256(HOST_SCRIPT.read_bytes()).hexdigest()
    env = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "LXC_LOG": str(log),
    }

    result = subprocess.run(
        ["bash", str(HOST_SCRIPT)],
        input=f"{wrapper_sha}\n{ARTIFACT}\n",
        capture_output=True,
        env=env,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert f"exec obo-prd -- bash -s -- {ARTIFACT} {'a' * 40}" in log.read_text()
