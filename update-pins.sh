#!/usr/bin/env bash
# Re-resolve the upstream images and toolchain, rewrite reproducible.env, and
# sync matching Dockerfile defaults. All network operations are read-only.
set -euo pipefail
cd "$(dirname "$0")"

UBUNTU_TAG=ubuntu:24.04
ALPINE_TAG=alpine:latest
NODE_TAG=node:18
DOCKERFILE_TAG=docker/dockerfile:1
BUILDKIT_TAG=moby/buildkit:buildx-stable-1
VAULTWARDEN_REPO=dani-garcia/vaultwarden
GO_MINOR=1.26

mdigest() { docker buildx imagetools inspect "$1" --format '{{.Manifest.Digest}}'; }

echo "Resolving pins..." >&2
UBUNTU_REF="${UBUNTU_TAG}@$(mdigest "$UBUNTU_TAG")"
ALPINE_REF="${ALPINE_TAG%%:*}@$(mdigest "$ALPINE_TAG")"
NODE_REF="${NODE_TAG}@$(mdigest "$NODE_TAG")"
DOCKERFILE_SYNTAX="${DOCKERFILE_TAG}@$(mdigest "$DOCKERFILE_TAG")"
BUILDKIT_REF="${BUILDKIT_TAG}@$(mdigest "$BUILDKIT_TAG")"

VAULTWARDEN_VERSION=$(curl -fsSL \
  "https://api.github.com/repos/${VAULTWARDEN_REPO}/releases/latest" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"].lstrip("v"))')
VAULTWARDEN_TAG="vaultwarden/server:${VAULTWARDEN_VERSION}"
VAULTWARDEN_REF="${VAULTWARDEN_TAG}@$(mdigest "$VAULTWARDEN_TAG")"

UBUNTU_SNAPSHOT="${UBUNTU_SNAPSHOT:-$(grep -E '^UBUNTU_SNAPSHOT=' reproducible.env | cut -d= -f2)}"
code=$(curl -fsS -o /dev/null -w '%{http_code}' \
  "https://snapshot.ubuntu.com/ubuntu/${UBUNTU_SNAPSHOT}/dists/noble/InRelease" || true)
[ "$code" = "200" ] || { echo "snapshot ${UBUNTU_SNAPSHOT} not valid (HTTP $code)" >&2; exit 1; }

read -r GO_VERSION GO_SHA256_AMD64 GO_SHA256_ARM64 < <(
  curl -fsSL "https://go.dev/dl/?mode=json&include=all" | python3 -c '
import json,sys
minor=sys.argv[1]
versions=[v for v in json.load(sys.stdin) if v["version"].startswith("go"+minor+".")]
key=lambda v:[int(x) for x in (v["version"][2:].split(".")+["0","0"])[:3] if x.isdigit()]
version=sorted(versions,key=key)[-1]
sha={f["arch"]:f["sha256"] for f in version["files"] if f["os"]=="linux" and f["kind"]=="archive"}
print(version["version"][2:], sha["amd64"], sha["arm64"])' "$GO_MINOR")

echo "Writing reproducible.env" >&2
tmp=$(mktemp)
{
  echo '# Pinned build inputs for build_docker_compose.sh and CI. Regenerate with ./update-pins.sh.'
  echo "UBUNTU_REF=${UBUNTU_REF}"
  echo "ALPINE_REF=${ALPINE_REF}"
  echo "NODE_REF=${NODE_REF}"
  echo "DOCKERFILE_SYNTAX=${DOCKERFILE_SYNTAX}"
  echo "BUILDKIT_REF=${BUILDKIT_REF}"
  echo "VAULTWARDEN_REF=${VAULTWARDEN_REF}"
  echo "UBUNTU_SNAPSHOT=${UBUNTU_SNAPSHOT}"
  echo "GO_VERSION=${GO_VERSION}"
  echo "GO_SHA256_AMD64=${GO_SHA256_AMD64}"
  echo "GO_SHA256_ARM64=${GO_SHA256_ARM64}"
} > "$tmp"
mv "$tmp" reproducible.env

echo "Syncing Dockerfile defaults" >&2
replace_line() {
  local file="$1" pattern="$2" replacement="$3" out
  out=$(mktemp)
  sed "s|${pattern}|${replacement}|" "$file" > "$out"
  mv "$out" "$file"
}

while IFS='=' read -r key value; do
  case "$key" in ''|\#*) continue;; esac
  if [ "$key" = "DOCKERFILE_SYNTAX" ]; then
    replace_line Dockerfile '^# syntax=.*' "# syntax=${value}"
  else
    replace_line Dockerfile "^ARG ${key}=.*" "ARG ${key}=${value}"
  fi
done < reproducible.env

echo "Done. Review with: git diff" >&2
