#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:?usage: deploy-prd.sh IMAGE}"
COMPOSE_DIR="${COMPOSE_DIR:-/opt/app}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-obo}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-/etc/obo/prd.env}"
COMPOSE_OVERRIDE="${COMPOSE_OVERRIDE:-deploy/docker-compose.prd.yml}"
SERVICE="${SERVICE:-obo}"
CONTAINER="${CONTAINER:-obo-obo-1}"
LOCAL_IMAGE="${LOCAL_IMAGE:-obo-prd-firebase:latest}"
PREVIOUS_IMAGE="${PREVIOUS_IMAGE:-obo-prd-firebase:previous}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://obo.oute.pro/api/auth/status}"
PUBLIC_LOGIN_URL="${PUBLIC_LOGIN_URL:-https://obo.oute.pro/login}"

if [[ ! "$IMAGE" =~ ^ghcr\.io/renatobardi/obo:prd-[0-9a-f]{40}@sha256:[0-9a-f]{64}$ ]]; then
  echo "Invalid production image reference" >&2
  exit 1
fi

cd "$COMPOSE_DIR"

if ! previous_image=$(docker inspect -f '{{.Image}}' "$CONTAINER"); then
  echo "Running production container not found: $CONTAINER" >&2
  exit 1
fi

docker tag "$previous_image" "$PREVIOUS_IMAGE"
docker pull "$IMAGE"

architecture=$(docker image inspect "$IMAGE" --format '{{.Architecture}}')
if [[ "$architecture" != "arm64" ]]; then
  echo "Expected arm64 image, got $architecture" >&2
  exit 1
fi
expected_image=$(docker image inspect -f '{{.Id}}' "$IMAGE")

wait_for_internal_health() {
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
    if docker exec "$CONTAINER" curl -fsS http://127.0.0.1:5055/health >/dev/null; then
      return 0
    fi
    sleep 5
  done
  return 1
}

wait_for_public_health() {
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
    if curl -fsS "$PUBLIC_HEALTH_URL" >/dev/null \
      && curl -fsS "$PUBLIC_LOGIN_URL" >/dev/null; then
      return 0
    fi
    sleep 5
  done
  return 1
}

cleanup_images() {
  local latest_id previous_id line
  latest_id=$(docker image inspect -f '{{.Id}}' "$LOCAL_IMAGE")
  previous_id=$(docker image inspect -f '{{.Id}}' "$PREVIOUS_IMAGE" 2>/dev/null || true)

  while IFS= read -r line; do
    [[ -z "$line" || "$line" == "<none>:<none>" ]] && continue
    local repo tag
    repo="${line%:*}"
    tag="${line#*:}"
    if [[ "$repo" == "ghcr.io/renatobardi/obo" && "$tag" =~ ^prd- ]]; then
      local id
      id=$(docker image inspect -f '{{.Id}}' "$line" 2>/dev/null || true) || id=""
      if [[ -n "$id" && "$id" != "$latest_id" && "$id" != "$previous_id" ]]; then
        docker rmi "$line" >/dev/null 2>&1 || true
      fi
    fi
  done < <(docker image ls --format '{{.Repository}}:{{.Tag}}')

  docker image prune -f >/dev/null 2>&1 || true
}

recreate_service() {
  docker compose \
    --env-file "$COMPOSE_ENV_FILE" \
    -f docker-compose.yml \
    -f "$COMPOSE_OVERRIDE" \
    -p "$COMPOSE_PROJECT" \
    up -d --no-deps --force-recreate --no-build "$SERVICE"
}

rollback() {
  echo "Rolling back to $previous_image" >&2
  docker tag "$previous_image" "$LOCAL_IMAGE"
  if ! recreate_service; then
    echo "ROLLBACK FAILED: service could not be recreated" >&2
    return 1
  fi
  if ! wait_for_internal_health || ! wait_for_public_health; then
    echo "ROLLBACK FAILED: previous image is unhealthy" >&2
    return 1
  fi
  echo "Rollback healthy" >&2
}

docker tag "$IMAGE" "$LOCAL_IMAGE"
if ! recreate_service; then
  rollback || true
  exit 1
fi

running_image=$(docker inspect -f '{{.Image}}' "$CONTAINER")
if [[ "$running_image" != "$expected_image" ]]; then
  echo "Deployed container is not using the requested image" >&2
  rollback || true
  exit 1
fi

if ! wait_for_internal_health || ! wait_for_public_health; then
  echo "Health check failed" >&2
  rollback || true
  exit 1
fi

cleanup_images || true

echo "Deployment healthy: $IMAGE"
