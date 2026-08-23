"""Every tracked file must be free of references to the project this codebase
was originally cloned from. See issue #1 (rebrand to Obo)."""

import re
import subprocess
from pathlib import Path

# This file's own path is excluded below since it must contain these
# substrings literally to define the check.
LEGACY_PATTERN = re.compile(r"open[-_ ]notebook|lfnovo", re.IGNORECASE)
SELF_PATH = Path(__file__).resolve()

# These are real, separately-maintained lfnovo-owned libraries this project
# depends on (esperanto, content-core, podcast-creator, surreal-commands —
# see pyproject.toml) or is planned to adopt (surreal-basics) — referencing
# them is not a leftover Open Notebook reference, so they're the narrow
# exceptions.
ALLOWED_PATTERN = re.compile(
    r"lfnovo/(esperanto|content-core|podcast-creator|surreal-commands|surreal-basics)",
    re.IGNORECASE,
)


def _repo_root() -> Path:
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=True,
    )
    return Path(result.stdout.strip())


def _tracked_files(root: Path) -> list[Path]:
    result = subprocess.run(
        ["git", "-C", str(root), "ls-files", "-z"],
        capture_output=True,
        check=True,
    )
    return [root / p for p in result.stdout.decode("utf-8").split("\0") if p]


def _find_legacy_references(root: Path) -> list[str]:
    hits = []
    for path in _tracked_files(root):
        if path == SELF_PATH:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            checked_line = ALLOWED_PATTERN.sub("", line)
            if LEGACY_PATTERN.search(checked_line):
                hits.append(f"{path.relative_to(root)}:{lineno}: {line.strip()}")
    return hits


def test_no_legacy_branding_references():
    hits = _find_legacy_references(_repo_root())
    assert not hits, (
        f"Found {len(hits)} legacy Open Notebook / lfnovo reference(s):\n"
        + "\n".join(hits)
    )
