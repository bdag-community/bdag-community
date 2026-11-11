#!/usr/bin/env bash
set -euo pipefail
set +x

umask 077
export AWS_PAGER=""

environment_name="${1:-}"
aws_profile_name="${2:-default}"
credential_source="cli"
credential_csv_file=""
credential_csv_identity=""
imported_access_key_id=""
secret_access_key=""

if [[ "$environment_name" != "development" ]]; then
  echo "This helper is development only; production credentials must remain absent." >&2
  exit 2
fi
if (( $# == 4 )) && [[ "${3:-}" == "--from-csv" ]]; then
  credential_source="csv"
  credential_csv_file="${4:-}"
elif (( $# > 2 )); then
  echo "Usage: $0 development [aws-profile] [--from-csv /absolute/path]" >&2
  exit 2
fi

for required_command in aws git node stat mktemp chmod mv rm; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Required local tooling is unavailable." >&2
    exit 1
  fi
done

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "${script_directory}/.." && pwd)"
environment_file="${repository_root}/.env.local"

if [[ "$credential_source" == "csv" ]]; then
  if [[ "$credential_csv_file" != /* || -L "$credential_csv_file" || ! -f "$credential_csv_file" ]]; then
    echo "The credential CSV must be an absolute regular file, not a link." >&2
    exit 1
  fi
  if credential_csv_mode="$(stat -f '%Lp' "$credential_csv_file" 2>/dev/null)"; then
    :
  else
    credential_csv_mode="$(stat -c '%a' "$credential_csv_file")"
  fi
  if [[ "$credential_csv_mode" != "600" && "$credential_csv_mode" != "400" ]]; then
    echo "The credential CSV permissions must be exactly 600 or 400." >&2
    exit 1
  fi

  credential_csv_identity="$(
    node -e '
      const stat = require("node:fs").lstatSync(process.argv[1]);
      if (!stat.isFile() || stat.isSymbolicLink()) process.exit(1);
      process.stdout.write(`${stat.dev}:${stat.ino}`);
    ' "$credential_csv_file"
  )"

  if credential_csv_check="$(
    node -e '
      const fs = require("node:fs");
      let source = fs.readFileSync(process.argv[1], "utf8");
      if (source.startsWith("\uFEFF")) source = source.slice(1);
      source = source.replace(/\r\n/g, "\n");
      if (source.includes("\r")) process.exit(41);
      if (source.endsWith("\n")) source = source.slice(0, -1);
      const lines = source.split("\n");
      const withUser = "User name,Access key ID,Secret access key";
      const withoutUser = "Access key ID,Secret access key";
      if (lines[0] !== withUser && lines[0] !== withoutUser) process.exit(41);
      if (lines.length !== 2 || !lines[1]) process.exit(42);
      const values = lines[1].split(",");
      const expectedColumns = lines[0] === withUser ? 3 : 2;
      if (values.length !== expectedColumns) process.exit(41);
      const offset = expectedColumns === 3 ? 1 : 0;
      if (offset === 1 && values[0] !== "bdag-community-assets-development-moderator") process.exit(43);
      if (!/^(?:AKIA|ASIA)[A-Z0-9]{16}$/.test(values[offset])) process.exit(44);
      if (!/^[A-Za-z0-9/+=]{40}$/.test(values[offset + 1])) process.exit(44);
      process.stdout.write("valid");
    ' "$credential_csv_file"
  )"; then
    :
  else
    credential_csv_status=$?
    case "$credential_csv_status" in
      41) echo "The credential CSV format or headers are not recognised." >&2 ;;
      42) echo "The credential CSV must contain exactly one credential row." >&2 ;;
      43) echo "The credential CSV contains an unexpected moderator username." >&2 ;;
      44) echo "The credential CSV contains invalid credential values." >&2 ;;
      *) echo "The credential CSV could not be validated." >&2 ;;
    esac
    exit 1
  fi
  unset credential_csv_check

  read_credential_csv_field() {
    local field_name="$1"
    node -e '
      const fs = require("node:fs");
      let source = fs.readFileSync(process.argv[1], "utf8");
      if (source.startsWith("\uFEFF")) source = source.slice(1);
      const lines = source.replace(/\r\n/g, "\n").trimEnd().split("\n");
      const headers = lines[0].split(",");
      const values = lines[1].split(",");
      const index = headers.indexOf(process.argv[2]);
      if (index < 0) process.exit(1);
      process.stdout.write(values[index]);
    ' "$credential_csv_file" "$field_name"
  }
  imported_access_key_id="$(read_credential_csv_field "Access key ID")"
  secret_access_key="$(read_credential_csv_field "Secret access key")"
fi

if [[ -L "$environment_file" || ( -e "$environment_file" && ! -f "$environment_file" ) ]]; then
  echo "The local environment target must be a regular file, not a link." >&2
  exit 1
fi
if ! git -C "$repository_root" check-ignore --quiet -- .env.local; then
  echo "The local environment target is not ignored by git." >&2
  exit 1
fi

aws_region_name="$(aws configure get region --profile "$aws_profile_name")"
if [[ "$aws_region_name" != "eu-central-1" ]]; then
  echo "The selected AWS profile must use eu-central-1." >&2
  exit 1
fi

account_id="$(
  aws sts get-caller-identity \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --query "Account" \
    --output text
)"
if [[ ! "$account_id" =~ ^[0-9]{12}$ ]]; then
  echo "The selected AWS profile returned an invalid account identity." >&2
  exit 1
fi

stack_name="bdag-community-s3-development"
stack_status="$(
  aws cloudformation describe-stacks \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --stack-name "$stack_name" \
    --query "Stacks[0].StackStatus" \
    --output text
)"
case "$stack_status" in
  CREATE_COMPLETE|UPDATE_COMPLETE) ;;
  *)
    echo "The development asset stack is not in a completed state." >&2
    exit 1
    ;;
esac

stack_environment="$(
  aws cloudformation describe-stacks \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --stack-name "$stack_name" \
    --query "Stacks[0].Parameters[?ParameterKey=='Environment'].ParameterValue | [0]" \
    --output text
)"
if [[ "$stack_environment" != "development" ]]; then
  echo "The stack environment is not development." >&2
  exit 1
fi

bucket_name="$(
  aws cloudformation describe-stacks \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --stack-name "$stack_name" \
    --query "Stacks[0].Outputs[?OutputKey=='AssetBucketName'].OutputValue | [0]" \
    --output text
)"
expected_bucket_name="bdag-community-assets-development-${account_id}-eu-central-1"
if [[ "$bucket_name" != "$expected_bucket_name" ]]; then
  echo "The stack returned an unexpected development asset bucket." >&2
  exit 1
fi

moderator_user_name="bdag-community-assets-development-moderator"
moderator_user_arn="$(
  aws cloudformation describe-stacks \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --stack-name "$stack_name" \
    --query "Stacks[0].Outputs[?OutputKey=='ModeratorUserArn'].OutputValue | [0]" \
    --output text
)"
expected_moderator_user_arn="arn:aws:iam::${account_id}:user/bdag-community/${moderator_user_name}"
if [[ "$moderator_user_arn" != "$expected_moderator_user_arn" ]]; then
  echo "The stack returned an unexpected moderator user." >&2
  exit 1
fi

moderator_user_record="$(
  aws iam get-user \
    --profile "$aws_profile_name" \
    --user-name "$moderator_user_name" \
    --query "User.[Arn,Path,UserName]" \
    --output text
)"
expected_moderator_user_record="${expected_moderator_user_arn}"$'\t''/bdag-community/'$'\t'"${moderator_user_name}"
if [[ "$moderator_user_record" != "$expected_moderator_user_record" ]]; then
  echo "The expected development moderator user could not be validated." >&2
  exit 1
fi

access_key_count="$(
  aws iam list-access-keys \
    --profile "$aws_profile_name" \
    --user-name "$moderator_user_name" \
    --query "length(AccessKeyMetadata)" \
    --output text
)"
if [[ "$credential_source" == "cli" && "$access_key_count" != "0" ]]; then
  echo "The development moderator user already has an access key; refusing to create another." >&2
  exit 1
fi
if [[ "$credential_source" == "csv" && "$access_key_count" != "1" ]]; then
  echo "The development moderator user must have exactly one access key for console import." >&2
  exit 1
fi

provisioning_complete="false"
temporary_environment_file=""
environment_written="false"
credential_validated="false"
created_access_key_id=""
runtime_access_key_id=""
cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n "$temporary_environment_file" ]]; then
    rm -f "$temporary_environment_file"
  fi
  if [[ "$status" -ne 0 && "$provisioning_complete" != "true" && "$credential_source" == "cli" && -n "$created_access_key_id" ]]; then
    if ! aws iam delete-access-key \
      --profile "$aws_profile_name" \
      --user-name "$moderator_user_name" \
      --access-key-id "$created_access_key_id" \
      >/dev/null 2>&1; then
      echo "Configuration failed and the newly created access key could not be removed." >&2
    fi
  fi
  if [[ "$status" -ne 0 && "$provisioning_complete" != "true" && "$credential_source" == "csv" && "$credential_validated" == "true" ]]; then
    if [[ "$environment_written" == "true" ]]; then
      echo "The local environment was written, but the credential CSV could not be removed. Securely delete it manually." >&2
    else
      echo "Local configuration failed. Revoke the console-created moderator key in AWS before retrying." >&2
    fi
  fi
  exit "$status"
}
trap cleanup EXIT

if [[ "$credential_source" == "cli" ]]; then
  credentials_json="$(
    aws iam create-access-key \
      --profile "$aws_profile_name" \
      --user-name "$moderator_user_name" \
      --output json
  )"

  created_access_key_id="$(
    printf '%s' "$credentials_json" | node -e '
      let source = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { source += chunk; });
      process.stdin.on("end", () => {
        const value = JSON.parse(source).AccessKey?.AccessKeyId;
        if (typeof value !== "string" || !/^(?:AKIA|ASIA)[A-Z0-9]{16}$/.test(value)) process.exit(1);
        process.stdout.write(value);
      });
    '
  )"
  runtime_access_key_id="$created_access_key_id"

  created_user_name="$(
    printf '%s' "$credentials_json" | node -e '
      let source = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { source += chunk; });
      process.stdin.on("end", () => {
        const value = JSON.parse(source).AccessKey?.UserName;
        if (typeof value !== "string") process.exit(1);
        process.stdout.write(value);
      });
    '
  )"
  if [[ "$created_user_name" != "$moderator_user_name" ]]; then
    echo "AWS returned a credential for an unexpected moderator user." >&2
    exit 1
  fi

  secret_access_key="$(
    printf '%s' "$credentials_json" | node -e '
      let source = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { source += chunk; });
      process.stdin.on("end", () => {
        const value = JSON.parse(source).AccessKey?.SecretAccessKey;
        if (typeof value !== "string" || !/^[A-Za-z0-9/+=]{40}$/.test(value)) process.exit(1);
        process.stdout.write(value);
      });
    '
  )"
  unset credentials_json

  post_create_access_key_count="$(
    aws iam list-access-keys \
      --profile "$aws_profile_name" \
      --user-name "$moderator_user_name" \
      --query "length(AccessKeyMetadata)" \
      --output text
  )"
  if [[ "$post_create_access_key_count" != "1" ]]; then
    echo "The development moderator user does not have exactly one access key after creation." >&2
    exit 1
  fi
else
  runtime_access_key_id="$imported_access_key_id"
fi

active_access_key_count="$(
  aws iam list-access-keys \
    --profile "$aws_profile_name" \
    --user-name "$moderator_user_name" \
    --query "length(AccessKeyMetadata[?Status=='Active'])" \
    --output text
)"
if [[ "$active_access_key_count" != "1" ]]; then
  echo "The development moderator user must have exactly one active access key." >&2
  exit 1
fi

active_access_key_id="$(
  aws iam list-access-keys \
    --profile "$aws_profile_name" \
    --user-name "$moderator_user_name" \
    --query "AccessKeyMetadata[?Status=='Active'].AccessKeyId | [0]" \
    --output text
)"
if [[ "$active_access_key_id" != "$runtime_access_key_id" ]]; then
  if [[ "$credential_source" == "csv" ]]; then
    echo "The single active key does not match the credential CSV." >&2
  else
    echo "The newly created access key is not the single active key." >&2
  fi
  exit 1
fi
credential_validated="true"

temporary_environment_file="$(mktemp "${environment_file}.tmp.XXXXXX")"
printf '%s\0' \
  "$runtime_access_key_id" \
  "$secret_access_key" | node -e '
    const fs = require("node:fs");
    const path = process.argv[1];
    const values = fs.readFileSync(0).toString("utf8").split("\0");
    if (values.at(-1) === "") values.pop();
    const keys = [
      "ASSET_MODERATION_S3_ACCESS_KEY_ID",
      "ASSET_MODERATION_S3_SECRET_ACCESS_KEY",
    ];
    if (values.length !== keys.length) process.exit(1);
    const managed = new Map(keys.map((key, index) => [key, values[index]]));
    const source = fs.existsSync(path) ? fs.readFileSync(path, "utf8") : "";
    const lines = source.replace(/\r\n/g, "\n").split("\n");
    if (lines.at(-1) === "") lines.pop();
    const emitted = new Set();
    const output = [];
    for (const line of lines) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
      const key = match?.[1];
      if (!key || !managed.has(key)) {
        output.push(line);
      } else if (!emitted.has(key)) {
        output.push(`${key}=${managed.get(key)}`);
        emitted.add(key);
      }
    }
    for (const key of keys) {
      if (!emitted.has(key)) output.push(`${key}=${managed.get(key)}`);
    }
    process.stdout.write(`${output.join("\n")}\n`);
  ' "$environment_file" >"$temporary_environment_file"

chmod 600 "$temporary_environment_file"
mv -f "$temporary_environment_file" "$environment_file"
temporary_environment_file=""
chmod 600 "$environment_file"
environment_written="true"

if [[ "$credential_source" == "csv" ]]; then
  node -e '
    const fs = require("node:fs");
    const path = process.argv[1];
    const expectedIdentity = process.argv[2];
    let descriptor;
    try {
      const before = fs.lstatSync(path);
      if (!before.isFile() || before.isSymbolicLink() || `${before.dev}:${before.ino}` !== expectedIdentity) process.exit(1);
      fs.chmodSync(path, 0o600);
      const noFollow = fs.constants.O_NOFOLLOW ?? 0;
      descriptor = fs.openSync(path, fs.constants.O_WRONLY | noFollow);
      const opened = fs.fstatSync(descriptor);
      if (`${opened.dev}:${opened.ino}` !== expectedIdentity) process.exit(1);
      fs.fchmodSync(descriptor, 0o600);
      fs.ftruncateSync(descriptor, 0);
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      const after = fs.lstatSync(path);
      if (!after.isFile() || after.isSymbolicLink() || `${after.dev}:${after.ino}` !== expectedIdentity) process.exit(1);
      fs.unlinkSync(path);
    } catch {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      process.exit(1);
    }
  ' "$credential_csv_file" "$credential_csv_identity"
fi

unset secret_access_key created_access_key_id runtime_access_key_id bucket_name account_id imported_access_key_id
provisioning_complete="true"
echo "Development asset moderator runtime configured securely."
