#!/usr/bin/env bash
set -euo pipefail

processor_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
output_argument="${1:-${processor_dir}/package.zip}"
output_dir="$(cd "$(dirname "$output_argument")" && pwd)"
output_path="${output_dir}/$(basename "$output_argument")"
staging_root="$(mktemp -d)"
trap 'rm -rf "$staging_root"' EXIT

npm run build --prefix "$processor_dir"

mkdir -p "$staging_root/dist"
cp "$processor_dir"/dist/*.js "$staging_root/dist/"
cp "$processor_dir/package.json" "$staging_root/package.json"
cp "$processor_dir/package-lock.json" "$staging_root/package-lock.json"

(
  cd "$staging_root"
  npm ci \
    --omit=dev \
    --ignore-scripts \
    --include=optional \
    --os=linux \
    --cpu=arm64 \
    --libc=glibc
)

find "$staging_root" -exec touch -t 198001010000 {} +
rm -f "$output_path"
(
  cd "$staging_root"
  find . -type f -print | LC_ALL=C sort | zip -X -q "$output_path" -@
)

printf 'Created %s\n' "$output_path"
