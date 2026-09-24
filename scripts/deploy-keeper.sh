#!/usr/bin/env bash
# Deploys the keeper to Railway (project renqun-keeper, service keeper).
#
# The keeper is one file plus viem and the venue ABI, so it ships as a small bundle rather than the
# whole monorepo. Its key lives only in the service's KEEPER_PRIVATE_KEY variable on Railway: this
# script never reads or sends a key. Needs `railway login`.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT

mkdir -p "$out/services/keeper" "$out/client/abi"
cp "$root/services/keeper/keeper.mjs" "$out/services/keeper/"
cp "$root/client/abi/yosukuPredict.json" "$out/client/abi/"
viem="$(node -p "require('$root/node_modules/viem/package.json').version")"
cat > "$out/package.json" <<EOF
{
  "name": "renqun-keeper",
  "private": true,
  "engines": { "node": ">=22" },
  "scripts": { "start": "node services/keeper/keeper.mjs" },
  "dependencies": { "viem": "$viem" }
}
EOF
printf 'node_modules/\n' > "$out/.gitignore"

cd "$out"
railway up \
  --project 2c09f49c-c507-4f71-88d3-7eb3b181568f \
  --environment production \
  --service keeper \
  --detach \
  -m "keeper at $(git -C "$root" rev-parse --short HEAD)"
