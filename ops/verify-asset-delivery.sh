#!/usr/bin/env bash
set -euo pipefail

environment_name="${1:-}"
aws_profile_name="${2:-default}"
verification_mode="${3:-foundation}"
export AWS_PAGER=""

case "$environment_name" in
  development|production) ;;
  *) echo "Usage: $0 <development|production> [aws-profile] [foundation|custom-domain]" >&2; exit 2 ;;
esac
case "$verification_mode" in
  foundation|custom-domain) ;;
  *) echo "Verification mode must be foundation or custom-domain." >&2; exit 2 ;;
esac
if [[ "$environment_name" != "production" && "$verification_mode" == "custom-domain" ]]; then
  echo "The custom asset hostname belongs only to production." >&2
  exit 2
fi

delivery_stack="bdag-community-assets-${environment_name}-delivery"
bucket_stack="bdag-community-s3-${environment_name}"

stack_state="$(aws cloudformation describe-stacks --profile "$aws_profile_name" --region us-east-1 --stack-name "$delivery_stack" --query 'Stacks[0].StackStatus' --output text)"
[[ "$stack_state" == "CREATE_COMPLETE" || "$stack_state" == "UPDATE_COMPLETE" ]]

distribution_id="$(aws cloudformation describe-stacks --profile "$aws_profile_name" --region us-east-1 --stack-name "$delivery_stack" --query "Stacks[0].Outputs[?OutputKey=='AssetDistributionId'].OutputValue | [0]" --output text)"
distribution_arn="$(aws cloudformation describe-stacks --profile "$aws_profile_name" --region us-east-1 --stack-name "$delivery_stack" --query "Stacks[0].Outputs[?OutputKey=='AssetDistributionArn'].OutputValue | [0]" --output text)"
distribution_domain="$(aws cloudformation describe-stacks --profile "$aws_profile_name" --region us-east-1 --stack-name "$delivery_stack" --query "Stacks[0].Outputs[?OutputKey=='AssetDistributionDomainName'].OutputValue | [0]" --output text)"
bucket_name="$(aws cloudformation describe-stacks --profile "$aws_profile_name" --region eu-central-1 --stack-name "$bucket_stack" --query "Stacks[0].Outputs[?OutputKey=='AssetBucketName'].OutputValue | [0]" --output text)"

[[ "$distribution_id" =~ ^[A-Z0-9]+$ ]]
[[ "$distribution_arn" =~ ^arn:aws:cloudfront::[0-9]{12}:distribution/${distribution_id}$ ]]
[[ "$distribution_domain" =~ ^[a-z0-9]{12,24}\.cloudfront\.net$ ]]
[[ "$bucket_name" =~ ^bdag-community-assets-${environment_name}-[0-9]{12}-eu-central-1$ ]]

distribution_contract="$(aws cloudfront get-distribution --profile "$aws_profile_name" --id "$distribution_id" --query '[Distribution.Status,Distribution.DistributionConfig.Enabled,Distribution.DistributionConfig.HttpVersion,Distribution.DistributionConfig.PriceClass,Distribution.DistributionConfig.DefaultCacheBehavior.ViewerProtocolPolicy,Distribution.DistributionConfig.DefaultCacheBehavior.CachePolicyId,Distribution.DistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId,Distribution.DistributionConfig.Origins.Items[0].DomainName,Distribution.DistributionConfig.Origins.Items[0].OriginAccessControlId]' --output text)"
IFS=$'\t' read -r deployed_state enabled http_version price_class viewer_policy cache_policy headers_policy origin_domain oac_id <<<"$distribution_contract"
[[ "$deployed_state" == "Deployed" ]]
[[ "$enabled" == "True" ]]
[[ "$http_version" == "http2and3" ]]
[[ "$price_class" == "PriceClass_200" ]]
[[ "$viewer_policy" == "redirect-to-https" ]]
[[ "$cache_policy" == "b2884449-e4de-46a7-ac36-70bc7f1ddd6d" ]]
[[ "$headers_policy" == "67f7725c-6f97-4210-82d7-5512b31e9d03" ]]
[[ "$origin_domain" == "${bucket_name}.s3.eu-central-1.amazonaws.com" ]]
[[ -n "$oac_id" && "$oac_id" != "None" ]]

oac_contract="$(aws cloudfront get-origin-access-control --profile "$aws_profile_name" --id "$oac_id" --query 'OriginAccessControl.OriginAccessControlConfig.[OriginAccessControlOriginType,SigningBehavior,SigningProtocol]' --output text)"
[[ "$oac_contract" == $'s3\talways\tsigv4' ]]

bucket_policy="$(aws s3api get-bucket-policy --profile "$aws_profile_name" --region eu-central-1 --bucket "$bucket_name" --query Policy --output text)"
EXPECTED_DISTRIBUTION_ARN="$distribution_arn" printf '%s' "$bucket_policy" | EXPECTED_DISTRIBUTION_ARN="$distribution_arn" node -e '
let source = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { source += chunk; });
process.stdin.on("end", () => {
  const policy = JSON.parse(source);
  const allow = policy.Statement.find((entry) => entry.Sid === "AllowCloudFrontPublishedReads");
  if (allow?.Principal?.Service !== "cloudfront.amazonaws.com") process.exit(1);
  if (allow?.Action !== "s3:GetObject") process.exit(1);
  if (allow?.Condition?.StringEquals?.["AWS:SourceArn"] !== process.env.EXPECTED_DISTRIBUTION_ARN) process.exit(1);
  if (!String(allow?.Resource).endsWith("/news/published/*")) process.exit(1);
});
'

direct_status="$(curl --silent --output /dev/null --write-out '%{http_code}' "https://${bucket_name}.s3.eu-central-1.amazonaws.com/news/published/verification/missing.webp")"
delivery_status="$(curl --silent --output /dev/null --write-out '%{http_code}' "https://${distribution_domain}/news/published/verification/missing.webp")"
[[ "$direct_status" == "403" ]]
[[ "$delivery_status" == "403" ]]

aliases="$(aws cloudfront get-distribution-config --profile "$aws_profile_name" --id "$distribution_id" --query 'DistributionConfig.Aliases.Items || `[]`' --output text)"
if [[ "$verification_mode" == "custom-domain" ]]; then
  [[ "$aliases" == "assets.bdag.community" ]]
  custom_status="$(curl --silent --output /dev/null --write-out '%{http_code}' https://assets.bdag.community/news/published/verification/missing.webp)"
  [[ "$custom_status" == "403" ]]
else
  [[ -z "$aliases" || "$aliases" == "None" ]]
fi

echo "Asset delivery verified for ${environment_name}."
