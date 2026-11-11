#!/usr/bin/env bash
set -euo pipefail

environment_name="${1:-}"
aws_profile_name="${2:-default}"
runtime_mode="${3:-foundation}"

export AWS_PAGER=""

case "$environment_name" in
  development) expected_origin="http://localhost:3011" ;;
  production) expected_origin="https://bdag.community" ;;
  *)
    echo "Usage: $0 <development|production> [aws-profile] [foundation|intake-ready|processor-ready|runtime-ready]" >&2
    exit 2
    ;;
esac

case "$runtime_mode" in
  foundation)
    expected_access_key_count="0"
    expected_moderator_key_count="0"
    expected_notification_enabled="false"
    expected_processor_resources="false"
    ;;
  intake-ready)
    expected_access_key_count="1"
    expected_moderator_key_count="0"
    expected_notification_enabled="false"
    expected_processor_resources="false"
    ;;
  processor-ready)
    expected_access_key_count="0"
    expected_moderator_key_count="0"
    expected_notification_enabled="true"
    expected_processor_resources="true"
    ;;
  runtime-ready)
    expected_access_key_count="1"
    expected_moderator_key_count="1"
    expected_notification_enabled="true"
    expected_processor_resources="true"
    ;;
  *) echo "Runtime mode must be foundation, intake-ready, processor-ready, or runtime-ready." >&2; exit 2 ;;
esac

aws_region_name="$(aws configure get region --profile "$aws_profile_name")"
if [[ -z "$aws_region_name" ]]; then
  echo "The selected AWS profile has no configured region." >&2
  exit 1
fi
if [[ "$aws_region_name" != "eu-central-1" ]]; then
  echo "The selected AWS profile must use eu-central-1." >&2
  exit 1
fi
stack_name="bdag-community-s3-${environment_name}"
bucket_name="$(
  aws cloudformation describe-stacks \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --stack-name "$stack_name" \
    --query "Stacks[0].Outputs[?OutputKey=='AssetBucketName'].OutputValue | [0]" \
    --output text
)"
intake_user_arn="$(
  aws cloudformation describe-stacks \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --stack-name "$stack_name" \
    --query "Stacks[0].Outputs[?OutputKey=='IntakeUserArn'].OutputValue | [0]" \
    --output text
)"
notification_parameter="$(
  aws cloudformation describe-stacks \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --stack-name "$stack_name" \
    --query "Stacks[0].Parameters[?ParameterKey=='EnableProcessorNotification'].ParameterValue | [0]" \
    --output text
)"
[[ "$notification_parameter" == "$expected_notification_enabled" ]]
processor_resources_parameter="$(
  aws cloudformation describe-stacks \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --stack-name "$stack_name" \
    --query "Stacks[0].Parameters[?ParameterKey=='EnableProcessorResources'].ParameterValue | [0]" \
    --output text
)"
[[ "$processor_resources_parameter" == "$expected_processor_resources" ]]
delivery_distribution_arn="$(
  aws cloudformation describe-stacks \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --stack-name "$stack_name" \
    --query "Stacks[0].Parameters[?ParameterKey=='AssetDeliveryDistributionArn'].ParameterValue | [0]" \
    --output text
)"
if [[ "$delivery_distribution_arn" != "None" && -n "$delivery_distribution_arn" ]]; then
  [[ "$delivery_distribution_arn" =~ ^arn:aws:cloudfront::[0-9]{12}:distribution/[A-Z0-9]+$ ]]
fi
moderator_user_arn=""
if [[ "$expected_processor_resources" == "true" ]]; then
  moderator_user_arn="$(
    aws cloudformation describe-stacks \
      --profile "$aws_profile_name" \
      --region "$aws_region_name" \
      --stack-name "$stack_name" \
      --query "Stacks[0].Outputs[?OutputKey=='ModeratorUserArn'].OutputValue | [0]" \
      --output text
  )"
fi

if [[ ! "$bucket_name" =~ ^bdag-community-assets-${environment_name}-[0-9]{12}-eu-central-1$ ]]; then
  echo "The stack returned an unexpected bucket name." >&2
  exit 1
fi

public_block="$(
  aws s3api get-public-access-block \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --bucket "$bucket_name" \
    --query "PublicAccessBlockConfiguration.[BlockPublicAcls,BlockPublicPolicy,IgnorePublicAcls,RestrictPublicBuckets]" \
    --output text
)"
[[ "$public_block" == $'True\tTrue\tTrue\tTrue' ]]

public_status="$(
  aws s3api get-bucket-policy-status \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --bucket "$bucket_name" \
    --query "PolicyStatus.IsPublic" \
    --output text
)"
[[ "$public_status" == "False" ]]

encryption="$(
  aws s3api get-bucket-encryption \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --bucket "$bucket_name" \
    --query "ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm" \
    --output text
)"
[[ "$encryption" == "AES256" ]]

versioning="$(
  aws s3api get-bucket-versioning \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --bucket "$bucket_name" \
    --query "Status" \
    --output text
)"
[[ "$versioning" == "Enabled" ]]

ownership="$(
  aws s3api get-bucket-ownership-controls \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --bucket "$bucket_name" \
    --query "OwnershipControls.Rules[0].ObjectOwnership" \
    --output text
)"
[[ "$ownership" == "BucketOwnerEnforced" ]]

notification_count="$(
  aws s3api get-bucket-notification-configuration \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --bucket "$bucket_name" \
    --query 'length(LambdaFunctionConfigurations || `[]`)' \
    --output text
)"
if [[ "$expected_notification_enabled" == "true" ]]; then
  [[ "$notification_count" == "1" ]]
  notification_contract="$(
    aws s3api get-bucket-notification-configuration \
      --profile "$aws_profile_name" \
      --region "$aws_region_name" \
      --bucket "$bucket_name" \
      --query "[LambdaFunctionConfigurations[0].Events[0],LambdaFunctionConfigurations[0].Filter.Key.FilterRules[?Name=='prefix'].Value | [0],LambdaFunctionConfigurations[0].Filter.Key.FilterRules[?Name=='suffix'].Value | [0]]" \
      --output text
  )"
  [[ "$notification_contract" == $'s3:ObjectCreated:Put\tnews/quarantine/\t/original' ]]
else
  [[ "$notification_count" == "0" ]]
fi

lifecycle_rules="$(
  aws s3api get-bucket-lifecycle-configuration \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --bucket "$bucket_name" \
    --query "length(Rules)" \
    --output text
)"
[[ "$lifecycle_rules" == "3" ]]

quarantine_contract="$(
  aws s3api get-bucket-lifecycle-configuration \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --bucket "$bucket_name" \
    --query "Rules[?ID=='ExpireQuarantineObjects'].[Status,Filter.Prefix,Expiration.Days,NoncurrentVersionExpiration.NoncurrentDays] | [0]" \
    --output text
)"
[[ "$quarantine_contract" == $'Enabled\tnews/quarantine/\t7\t7' ]]

rejected_contract="$(
  aws s3api get-bucket-lifecycle-configuration \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --bucket "$bucket_name" \
    --query "Rules[?ID=='ExpireRejectedObjects'].[Status,Filter.Prefix,Expiration.Days,NoncurrentVersionExpiration.NoncurrentDays] | [0]" \
    --output text
)"
[[ "$rejected_contract" == $'Enabled\tnews/rejected/\t30\t30' ]]

multipart_contract="$(
  aws s3api get-bucket-lifecycle-configuration \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --bucket "$bucket_name" \
    --query "Rules[?ID=='AbortIncompleteMultipartUploads'].[Status,Filter.Prefix,AbortIncompleteMultipartUpload.DaysAfterInitiation] | [0]" \
    --output text
)"
[[ "$multipart_contract" == $'Enabled\tnews/\t1' ]]

cors_contract="$(
  aws s3api get-bucket-cors \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --bucket "$bucket_name" \
    --query "[length(CORSRules),CORSRules[0].AllowedOrigins[0],CORSRules[0].AllowedMethods[0],join(',',CORSRules[0].AllowedHeaders),CORSRules[0].MaxAgeSeconds]" \
    --output text
)"
[[ "$cors_contract" == "1"$'\t'"${expected_origin}"$'\tPUT\tContent-Type,If-None-Match\t300' ]]

bucket_policy="$(
  aws s3api get-bucket-policy \
    --profile "$aws_profile_name" \
    --region "$aws_region_name" \
    --bucket "$bucket_name" \
    --query "Policy" \
    --output text
)"
bucket_policy_file="$(mktemp)"
trap 'rm -f "$bucket_policy_file"' EXIT
printf '%s' "$bucket_policy" >"$bucket_policy_file"
export EXPECTED_DELIVERY_ARN="$delivery_distribution_arn"
printf '%s' "$bucket_policy" | node -e '
  let source = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { source += chunk; });
  process.stdin.on("end", () => {
    const policy = JSON.parse(source);
    const bySid = Object.fromEntries(policy.Statement.map((entry) => [entry.Sid, entry]));
    if (bySid.DenyMissingQuarantineWriteCondition?.Condition?.Null?.["s3:if-none-match"] !== "true") process.exit(1);
    if (bySid.DenyIncorrectQuarantineWriteCondition?.Condition?.StringNotEquals?.["s3:if-none-match"] !== "*") process.exit(1);
    if (bySid.DenyStaleQuarantineSignature?.Condition?.NumericGreaterThan?.["s3:signatureAge"] !== "300000") process.exit(1);
    if (bySid.DenyMissingProcessedWriteCondition?.Condition?.Null?.["s3:if-none-match"] !== "true") process.exit(1);
    if (bySid.DenyIncorrectProcessedWriteCondition?.Condition?.StringNotEquals?.["s3:if-none-match"] !== "*") process.exit(1);
    const expectedArn = process.env.EXPECTED_DELIVERY_ARN;
    const delivery = bySid.AllowCloudFrontPublishedReads;
    if (expectedArn && expectedArn !== "None") {
      if (delivery?.Principal?.Service !== "cloudfront.amazonaws.com") process.exit(1);
      if (delivery?.Action !== "s3:GetObject") process.exit(1);
      if (delivery?.Condition?.StringEquals?.["AWS:SourceArn"] !== expectedArn) process.exit(1);
      if (!String(delivery?.Resource).endsWith("/news/published/*")) process.exit(1);
    } else if (delivery) process.exit(1);
  });
'

access_key_count="$(
  aws iam list-access-keys \
    --profile "$aws_profile_name" \
    --user-name "${intake_user_arn##*/}" \
    --query "length(AccessKeyMetadata)" \
    --output text
)"
[[ "$access_key_count" == "$expected_access_key_count" ]]

if [[ "$expected_processor_resources" == "true" ]]; then
  moderator_key_count="$(
    aws iam list-access-keys \
      --profile "$aws_profile_name" \
      --user-name "${moderator_user_arn##*/}" \
      --query "length(AccessKeyMetadata)" \
      --output text
  )"
  [[ "$moderator_key_count" == "$expected_moderator_key_count" ]]

  for moderator_contract in \
    "s3:GetObject|arn:aws:s3:::${bucket_name}/news/processed/verification/result.json|allowed" \
    "s3:GetObjectVersion|arn:aws:s3:::${bucket_name}/news/processed/verification/cover.webp|allowed" \
    "s3:GetObject|arn:aws:s3:::${bucket_name}/news/published/verification/cover.webp|allowed" \
    "s3:DeleteObjectVersion|arn:aws:s3:::${bucket_name}/news/quarantine/verification/original|allowed" \
    "s3:DeleteObjectVersion|arn:aws:s3:::${bucket_name}/news/processed/verification/cover.webp|allowed" \
    "s3:DeleteObjectVersion|arn:aws:s3:::${bucket_name}/news/published/verification/cover.webp|allowed" \
    "s3:GetObject|arn:aws:s3:::${bucket_name}/news/quarantine/verification/original|implicitDeny" \
    "s3:GetObjectVersion|arn:aws:s3:::${bucket_name}/news/published/verification/cover.webp|implicitDeny" \
    "s3:PutObject|arn:aws:s3:::${bucket_name}/news/published/verification/cover.webp|implicitDeny" \
    "s3:ListBucket|arn:aws:s3:::${bucket_name}|implicitDeny" \
    "s3:DeleteObject|arn:aws:s3:::${bucket_name}/news/published/verification/cover.webp|implicitDeny"; do
    IFS="|" read -r moderator_action moderator_resource moderator_expected <<<"$moderator_contract"
    moderator_decision="$(
      aws iam simulate-principal-policy \
        --profile "$aws_profile_name" \
        --policy-source-arn "$moderator_user_arn" \
        --action-names "$moderator_action" \
        --resource-arns "$moderator_resource" \
        --query "EvaluationResults[0].EvalDecision" \
        --output text
    )"
    [[ "$moderator_decision" == "$moderator_expected" ]]
  done

  moderator_copy_decision="$(
    aws iam simulate-principal-policy \
      --profile "$aws_profile_name" \
      --policy-source-arn "$moderator_user_arn" \
      --action-names "s3:PutObject" \
      --resource-arns "arn:aws:s3:::${bucket_name}/news/published/verification/cover.webp" \
      --context-entries \
        "ContextKeyName=s3:x-amz-copy-source,ContextKeyValues=${bucket_name}/news/processed/verification/cover.webp?versionId=verified-version,ContextKeyType=string" \
        "ContextKeyName=s3:x-amz-metadata-directive,ContextKeyValues=REPLACE,ContextKeyType=string" \
        "ContextKeyName=s3:if-none-match,ContextKeyValues=*,ContextKeyType=string" \
      --query "EvaluationResults[0].EvalDecision" \
      --output text
  )"
  [[ "$moderator_copy_decision" == "allowed" ]]

  for moderator_denied_copy_context in \
    "missing-copy-source" \
    "wrong-copy-source" \
    "missing-metadata-directive" \
    "wrong-metadata-directive" \
    "missing-write-condition" \
    "wrong-write-condition"; do
    moderator_copy_context_entries=(
      "ContextKeyName=s3:x-amz-copy-source,ContextKeyValues=${bucket_name}/news/processed/verification/cover.webp?versionId=verified-version,ContextKeyType=string"
      "ContextKeyName=s3:x-amz-metadata-directive,ContextKeyValues=REPLACE,ContextKeyType=string"
      "ContextKeyName=s3:if-none-match,ContextKeyValues=*,ContextKeyType=string"
    )
    case "$moderator_denied_copy_context" in
      missing-copy-source) moderator_copy_context_entries=("${moderator_copy_context_entries[@]:1}") ;;
      wrong-copy-source) moderator_copy_context_entries[0]="ContextKeyName=s3:x-amz-copy-source,ContextKeyValues=${bucket_name}/news/quarantine/verification/original?versionId=verified-version,ContextKeyType=string" ;;
      missing-metadata-directive) moderator_copy_context_entries=("${moderator_copy_context_entries[0]}" "${moderator_copy_context_entries[2]}") ;;
      wrong-metadata-directive) moderator_copy_context_entries[1]="ContextKeyName=s3:x-amz-metadata-directive,ContextKeyValues=COPY,ContextKeyType=string" ;;
      missing-write-condition) moderator_copy_context_entries=("${moderator_copy_context_entries[@]:0:2}") ;;
      wrong-write-condition) moderator_copy_context_entries[2]="ContextKeyName=s3:if-none-match,ContextKeyValues=changed,ContextKeyType=string" ;;
    esac
    moderator_denied_copy_decision="$(
      aws iam simulate-principal-policy \
        --profile "$aws_profile_name" \
        --policy-source-arn "$moderator_user_arn" \
        --action-names "s3:PutObject" \
        --resource-arns "arn:aws:s3:::${bucket_name}/news/published/verification/cover.webp" \
        --context-entries "${moderator_copy_context_entries[@]}" \
        --query "EvaluationResults[0].EvalDecision" \
        --output text
    )"
    [[ "$moderator_denied_copy_decision" == "implicitDeny" ]]
  done
fi

allowed_decision="$(
  aws iam simulate-principal-policy \
    --profile "$aws_profile_name" \
    --policy-source-arn "$intake_user_arn" \
    --action-names "s3:PutObject" \
    --resource-arns "arn:aws:s3:::${bucket_name}/news/quarantine/verification/allowed" \
    --resource-policy "file://${bucket_policy_file}" \
    --context-entries \
      "ContextKeyName=s3:if-none-match,ContextKeyValues=*,ContextKeyType=string" \
      "ContextKeyName=s3:authType,ContextKeyValues=REST-QUERY-STRING,ContextKeyType=string" \
      "ContextKeyName=s3:signatureversion,ContextKeyValues=AWS4-HMAC-SHA256,ContextKeyType=string" \
      "ContextKeyName=s3:signatureAge,ContextKeyValues=1,ContextKeyType=numeric" \
    --query "EvaluationResults[0].EvalDecision" \
    --output text
)"
[[ "$allowed_decision" == "allowed" ]]

for denied_context in \
  "missing" \
  "wrong-condition" \
  "stale" \
  "wrong-auth" \
  "wrong-signature"; do
  context_entries=(
    "ContextKeyName=s3:if-none-match,ContextKeyValues=*,ContextKeyType=string"
    "ContextKeyName=s3:authType,ContextKeyValues=REST-QUERY-STRING,ContextKeyType=string"
    "ContextKeyName=s3:signatureversion,ContextKeyValues=AWS4-HMAC-SHA256,ContextKeyType=string"
    "ContextKeyName=s3:signatureAge,ContextKeyValues=1,ContextKeyType=numeric"
  )
  case "$denied_context" in
    missing) context_entries=("${context_entries[@]:1}") ;;
    wrong-condition) context_entries[0]="ContextKeyName=s3:if-none-match,ContextKeyValues=changed,ContextKeyType=string" ;;
    stale) context_entries[3]="ContextKeyName=s3:signatureAge,ContextKeyValues=300001,ContextKeyType=numeric" ;;
    wrong-auth) context_entries[1]="ContextKeyName=s3:authType,ContextKeyValues=REST-HEADER,ContextKeyType=string" ;;
    wrong-signature) context_entries[2]="ContextKeyName=s3:signatureversion,ContextKeyValues=AWS,ContextKeyType=string" ;;
  esac
  negative_decision="$(
    aws iam simulate-principal-policy \
      --profile "$aws_profile_name" \
      --policy-source-arn "$intake_user_arn" \
      --action-names "s3:PutObject" \
      --resource-arns "arn:aws:s3:::${bucket_name}/news/quarantine/verification/${denied_context}" \
      --resource-policy "file://${bucket_policy_file}" \
      --context-entries "${context_entries[@]}" \
      --query "EvaluationResults[0].EvalDecision" \
      --output text
  )"
  [[ "$negative_decision" == "explicitDeny" || "$negative_decision" == "implicitDeny" ]]
done

denied_decision="$(
  aws iam simulate-principal-policy \
    --profile "$aws_profile_name" \
    --policy-source-arn "$intake_user_arn" \
    --action-names "s3:PutObject" \
    --resource-arns "arn:aws:s3:::${bucket_name}/news/published/verification/denied" \
    --query "EvaluationResults[0].EvalDecision" \
    --output text
)"
[[ "$denied_decision" == "implicitDeny" ]]

for denied_action in s3:GetObject s3:DeleteObject s3:ListBucket s3:GetBucketLocation; do
  denied_resource="arn:aws:s3:::${bucket_name}/news/quarantine/verification/denied"
  if [[ "$denied_action" == "s3:ListBucket" || "$denied_action" == "s3:GetBucketLocation" ]]; then
    denied_resource="arn:aws:s3:::${bucket_name}"
  fi
  denied_action_decision="$(
    aws iam simulate-principal-policy \
      --profile "$aws_profile_name" \
      --policy-source-arn "$intake_user_arn" \
      --action-names "$denied_action" \
      --resource-arns "$denied_resource" \
      --query "EvaluationResults[0].EvalDecision" \
      --output text
  )"
  [[ "$denied_action_decision" == "implicitDeny" ]]
done

anonymous_code="$(
  curl \
    --silent \
    --show-error \
    --output /dev/null \
    --write-out "%{http_code}" \
    "https://${bucket_name}.s3.${aws_region_name}.amazonaws.com/news/published/verification/denied"
)"
[[ "$anonymous_code" == "403" ]]

echo "S3 foundation verified for ${environment_name}: private, conditional-write-only, encrypted, versioned, and prefix-scoped."
