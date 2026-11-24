#!/bin/bash
# BDAG Community production deploy. Runs on the Xneelo host and keeps the
# current container serving until a separately bound candidate is healthy.
set -euo pipefail

source_dir="/opt/bdag-community/src"
runtime_file="/opt/bdag-community/bdag-community.env"
caddy_config="/etc/caddy/Caddyfile"
caddy_site_file="/etc/caddy/sites-enabled/bdag-community.caddy"
active_name="bdag-community"
candidate_name="bdag-community-candidate"
previous_name="bdag-community-previous"
candidate_ready="false"
promoted="false"

cd "$source_dir"

if [ "$(stat -c '%a' "$runtime_file")" != "600" ]; then
  echo "DEPLOY FAILED: production runtime file must be mode 600" >&2
  exit 1
fi
while IFS='=' read -r runtime_name runtime_value; do
  case "$runtime_name" in
    ""|\#*) continue ;;
  esac
  if [[ ! "$runtime_name" =~ ^[A-Z0-9_]+$ ]]; then
    echo "DEPLOY FAILED: production runtime file contains an invalid name" >&2
    exit 1
  fi
  export "$runtime_name=$runtime_value"
done <"$runtime_file"

for required_name in \
  NEXT_PUBLIC_SITE_URL \
  NEXT_PUBLIC_SUPABASE_URL \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  SUPABASE_SECRET_KEY \
  RESEND_API_KEY \
  SUGGESTION_FROM_EMAIL \
  SUGGESTION_NOTIFY_EMAIL \
  NEXT_PUBLIC_TURNSTILE_SITE_KEY \
  TURNSTILE_SECRET_KEY \
  TURNSTILE_EXPECTED_HOSTNAME \
  ABUSE_HMAC_SECRET \
  ASSET_STORAGE_ENVIRONMENT \
  ASSET_S3_REGION \
  ASSET_S3_BUCKET \
  ASSET_S3_ACCESS_KEY_ID \
  ASSET_S3_SECRET_ACCESS_KEY \
  ASSET_CAPABILITY_HMAC_SECRET \
  ASSET_MODERATION_S3_ACCESS_KEY_ID \
  ASSET_MODERATION_S3_SECRET_ACCESS_KEY \
  ASSET_DELIVERY_ORIGIN \
  ORIGIN_GATE_SECRET; do
  if [ -z "${!required_name:-}" ]; then
    echo "DEPLOY FAILED: ${required_name} is required for go-live" >&2
    exit 1
  fi
done

if [ "$NEXT_PUBLIC_SITE_URL" != "https://bdag.community" ]; then
  echo "DEPLOY FAILED: NEXT_PUBLIC_SITE_URL must be https://bdag.community" >&2
  exit 1
fi
if [ "$TURNSTILE_EXPECTED_HOSTNAME" != "bdag.community" ]; then
  echo "DEPLOY FAILED: TURNSTILE_EXPECTED_HOSTNAME must be bdag.community" >&2
  exit 1
fi
if [ "$ASSET_STORAGE_ENVIRONMENT" != "production" ]; then
  echo "DEPLOY FAILED: ASSET_STORAGE_ENVIRONMENT must be production" >&2
  exit 1
fi
if [ "$ASSET_S3_REGION" != "eu-central-1" ]; then
  echo "DEPLOY FAILED: ASSET_S3_REGION must be eu-central-1" >&2
  exit 1
fi
if [ "$ASSET_DELIVERY_ORIGIN" != "https://assets.bdag.community" ]; then
  echo "DEPLOY FAILED: ASSET_DELIVERY_ORIGIN must be https://assets.bdag.community" >&2
  exit 1
fi
if [ "$SUGGESTION_NOTIFY_EMAIL" != "admin@bdag.community" ]; then
  echo "DEPLOY FAILED: SUGGESTION_NOTIFY_EMAIL must be admin@bdag.community" >&2
  exit 1
fi
if [ "${TURNSTILE_TEST_MODE:-false}" = "true" ]; then
  echo "DEPLOY FAILED: Turnstile test mode is forbidden in production" >&2
  exit 1
fi
case "$NEXT_PUBLIC_TURNSTILE_SITE_KEY" in
  1x*|2x*|3x*) echo "DEPLOY FAILED: dummy Turnstile test keys are forbidden in production" >&2; exit 1 ;;
esac
case "$TURNSTILE_SECRET_KEY" in
  1x*|2x*|3x*) echo "DEPLOY FAILED: dummy Turnstile test keys are forbidden in production" >&2; exit 1 ;;
esac
for secret_name in ABUSE_HMAC_SECRET ASSET_CAPABILITY_HMAC_SECRET; do
  secret_value="${!secret_name}"
  if [ "${#secret_value}" -lt 32 ]; then
    echo "DEPLOY FAILED: ${secret_name} must contain at least 32 characters" >&2
    exit 1
  fi
done
if [[ ! "$ORIGIN_GATE_SECRET" =~ ^[0-9a-f]{64}$ ]]; then
  echo "DEPLOY FAILED: ORIGIN_GATE_SECRET must be 64 lowercase hexadecimal characters" >&2
  exit 1
fi

if ! sudo grep -Fq 'import /etc/caddy/sites-enabled/*.caddy' "$caddy_config"; then
  echo "DEPLOY FAILED: the reviewed Caddy site import is not installed" >&2
  exit 1
fi

active_port=""
if docker container inspect "$active_name" >/dev/null 2>&1; then
  active_port="$(docker inspect "$active_name" --format '{{(index (index .HostConfig.PortBindings "3000/tcp") 0).HostPort}}')"
fi
case "$active_port" in
  3001) candidate_port="3002" ;;
  3002) candidate_port="3001" ;;
  "") candidate_port="3001" ;;
  *) echo "DEPLOY FAILED: active container uses an unexpected port" >&2; exit 1 ;;
esac

build_id="$(date -u +%Y%m%d%H%M%S)"
candidate_image="bdag-community:production-${build_id}"

if [ -n "${BDAG_PREBUILT_IMAGE:-}" ]; then
  if [[ ! "$BDAG_PREBUILT_IMAGE" =~ ^bdag-community:verified-[a-f0-9]{40}$ ]]; then
    echo "DEPLOY FAILED: invalid prebuilt image reference" >&2
    exit 1
  fi
  docker image inspect "$BDAG_PREBUILT_IMAGE" >/dev/null
  candidate_image="$BDAG_PREBUILT_IMAGE"
else
echo "==> building candidate image"
# This box is a shared 3.9GB VM (bdag-miner-sales runs beside this site). A
# `next build` memory spike once pushed the whole host into swap-thrash — sshd
# and both sites went unreachable until a reboot. Cap the build's memory and
# give it NO swap (--memory-swap == --memory), so a spike OOM-kills THIS build
# cleanly (the deploy fails, the current container keeps serving) instead of
# taking the machine down. 2560m leaves headroom for the system + the running
# container; raise it if a legitimate build is ever OOM-killed here.
docker build \
  --memory=2560m --memory-swap=2560m \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY="$NEXT_PUBLIC_TURNSTILE_SITE_KEY" \
  --build-arg ASSET_STORAGE_ENVIRONMENT="$ASSET_STORAGE_ENVIRONMENT" \
  --build-arg ASSET_DELIVERY_ORIGIN="$ASSET_DELIVERY_ORIGIN" \
  -t "$candidate_image" .
fi

cleanup_candidate() {
  if [ "$promoted" != "true" ]; then
    docker rm -f "$candidate_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup_candidate EXIT

docker rm -f "$candidate_name" >/dev/null 2>&1 || true
docker run -d --name "$candidate_name" --restart unless-stopped \
  --log-opt max-size=10m --log-opt max-file=3 \
  -p "127.0.0.1:${candidate_port}:3000" \
  --env-file "$runtime_file" \
  "$candidate_image" >/dev/null

echo "==> proving candidate health"
for attempt in $(seq 1 12); do
  if curl --fail --silent --show-error --max-time 20 \
    "http://127.0.0.1:${candidate_port}/api/health" >/dev/null 2>&1; then
    candidate_ready="true"
    break
  fi
  sleep 3
done
if [ "$candidate_ready" != "true" ]; then
  echo "DEPLOY FAILED: candidate did not become healthy; current container was not changed" >&2
  exit 1
fi

next_site_file="$(mktemp)"
previous_site_file="$(mktemp)"
had_previous_site="false"
trap 'rm -f "$next_site_file" "$previous_site_file"; cleanup_candidate' EXIT

# Caddy compresses the public response. Request plain JSON from routes that
# also compress at the application layer.
printf '%s\n' \
  'bdag.community {' \
  "  @origin_gate header X-BDAG-Origin ${ORIGIN_GATE_SECRET}" \
  '  @snapshot_json path /api/stats /api/chain-history' \
  '  handle @origin_gate {' \
  '    encode zstd gzip' \
  "    reverse_proxy @snapshot_json 127.0.0.1:${candidate_port} {" \
  '      header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}' \
  '      header_up Accept-Encoding identity' \
  '    }' \
  "    reverse_proxy 127.0.0.1:${candidate_port} {" \
  '      header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}' \
  '    }' \
  '  }' \
  '  respond "Forbidden" 403' \
  '}' \
  '' \
  'www.bdag.community {' \
  "  @origin_gate header X-BDAG-Origin ${ORIGIN_GATE_SECRET}" \
  '  handle @origin_gate {' \
  '    redir https://bdag.community{uri} permanent' \
  '  }' \
  '  respond "Forbidden" 403' \
  '}' >"$next_site_file"

if sudo test -f "$caddy_site_file"; then
  sudo cp "$caddy_site_file" "$previous_site_file"
  had_previous_site="true"
fi

restore_caddy() {
  if [ "$had_previous_site" = "true" ]; then
    sudo install -o root -g caddy -m 0640 "$previous_site_file" "$caddy_site_file"
  else
    sudo rm -f "$caddy_site_file"
  fi
  sudo caddy reload --config "$caddy_config" >/dev/null 2>&1 || true
}

sudo install -o root -g caddy -m 0640 "$next_site_file" "$caddy_site_file"
if ! sudo caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
  restore_caddy
  echo "DEPLOY FAILED: candidate Caddy configuration is invalid" >&2
  exit 1
fi
if ! sudo caddy reload --config "$caddy_config" >/dev/null 2>&1; then
  restore_caddy
  echo "DEPLOY FAILED: Caddy rejected the candidate route" >&2
  exit 1
fi
if ! curl --fail --silent --show-error --max-time 20 \
  http://127.0.0.1:2019/config/ \
  | jq -e --arg dial "127.0.0.1:${candidate_port}" \
    '.. | objects | select(.dial? == $dial)' >/dev/null; then
  restore_caddy
  echo "DEPLOY FAILED: switched route was not healthy; Caddy was restored" >&2
  exit 1
fi

docker rm -f "$previous_name" >/dev/null 2>&1 || true
if docker container inspect "$active_name" >/dev/null 2>&1; then
  docker rename "$active_name" "$previous_name"
fi
docker rename "$candidate_name" "$active_name"
promoted="true"
docker tag "$candidate_image" bdag-community:production
if docker container inspect "$previous_name" >/dev/null 2>&1; then
  docker stop "$previous_name" >/dev/null
fi

echo "DEPLOY COMPLETE: candidate is healthy and Caddy now serves it"
