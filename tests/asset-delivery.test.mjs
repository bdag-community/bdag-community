import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const deliveryTemplateUrl = new URL(
  "../infra/aws/asset-delivery.template.json",
  import.meta.url,
);
const deliveryVerifierUrl = new URL(
  "../ops/verify-asset-delivery.sh",
  import.meta.url,
);
const templateExists = existsSync(deliveryTemplateUrl);
const template = templateExists
  ? JSON.parse(readFileSync(deliveryTemplateUrl, "utf8"))
  : null;
const resources = template?.Resources ?? {};
const distribution = resources.AssetDistribution?.Properties?.DistributionConfig;

test("Step 11 has an account-neutral controlled asset-delivery template", () => {
  assert.equal(templateExists, true, "the asset delivery template must exist");
  assert.deepEqual(template.Parameters.Environment.AllowedValues, [
    "development",
    "production",
  ]);
  assert.equal(template.Parameters.AssetBucketName.Type, "String");
  assert.equal(template.Parameters.EnableCustomDomain.Default, "false");
  assert.equal(template.Parameters.WebAclArn.Default, "");
  const source = JSON.stringify(template);
  assert.doesNotMatch(source, /\b\d{12}\b|AKIA[0-9A-Z]{16}/);
  assert.doesNotMatch(source, /bdag-community-assets-(development|production)-\d/);
});

test("Step 11 has a redacted read-only delivery verifier", () => {
  assert.equal(existsSync(deliveryVerifierUrl), true);
  const verifier = readFileSync(deliveryVerifierUrl, "utf8");
  assert.match(verifier, /get-distribution/);
  assert.match(verifier, /get-origin-access-control/);
  assert.match(verifier, /AllowCloudFrontPublishedReads/);
  assert.match(verifier, /cloudfront\.amazonaws\.com/);
  assert.match(verifier, /news\/published\/verification\/missing\.webp/);
  assert.match(verifier, /direct_status[\s\S]*403/);
  assert.match(verifier, /delivery_status[\s\S]*403/);
  assert.doesNotMatch(verifier, /create-|update-|delete-|put-/);
});

test(
  "CloudFront uses an always-signed private S3 origin and a narrow viewer contract",
  { skip: !templateExists },
  () => {
    assert.equal(resources.AssetOriginAccessControl.Type, "AWS::CloudFront::OriginAccessControl");
    assert.deepEqual(
      resources.AssetOriginAccessControl.Properties.OriginAccessControlConfig,
      {
        Description: "Private BlockDAG Community published-asset origin",
        Name: { "Fn::Sub": "bdag-community-assets-${Environment}-oac" },
        OriginAccessControlOriginType: "s3",
        SigningBehavior: "always",
        SigningProtocol: "sigv4",
      },
    );
    assert.equal(distribution.Enabled, true);
    assert.equal(distribution.HttpVersion, "http2and3");
    assert.equal(distribution.IPV6Enabled, true);
    assert.equal(distribution.PriceClass, "PriceClass_200");
    assert.equal(distribution.DefaultRootObject, undefined);
    assert.equal(distribution.Origins.length, 1);
    assert.deepEqual(distribution.Origins[0].DomainName, {
      "Fn::Sub": "${AssetBucketName}.s3.eu-central-1.amazonaws.com",
    });
    assert.deepEqual(distribution.Origins[0].S3OriginConfig, {
      OriginAccessIdentity: "",
    });
    assert.deepEqual(distribution.DefaultCacheBehavior.AllowedMethods, [
      "GET",
      "HEAD",
    ]);
    assert.deepEqual(distribution.DefaultCacheBehavior.CachedMethods, [
      "GET",
      "HEAD",
    ]);
    assert.equal(
      distribution.DefaultCacheBehavior.ViewerProtocolPolicy,
      "redirect-to-https",
    );
    assert.equal(
      distribution.DefaultCacheBehavior.CachePolicyId,
      "b2884449-e4de-46a7-ac36-70bc7f1ddd6d",
    );
    assert.equal(
      distribution.DefaultCacheBehavior.ResponseHeadersPolicyId,
      "67f7725c-6f97-4210-82d7-5512b31e9d03",
    );
    assert.equal(distribution.DefaultCacheBehavior.Compress, true);
    assert.equal(distribution.CustomErrorResponses, undefined);
    assert.equal(distribution.Logging, undefined);
    assert.equal(distribution.OriginGroups, undefined);
    assert.equal(distribution.DefaultCacheBehavior.LambdaFunctionAssociations, undefined);
  },
);

test(
  "production custom delivery DNS and TLS are isolated behind a two-phase switch",
  { skip: !templateExists },
  () => {
    assert.equal(resources.AssetHostedZone.Type, "AWS::Route53::HostedZone");
    assert.equal(resources.AssetHostedZone.Condition, "IsProduction");
    assert.equal(
      resources.AssetHostedZone.Properties.Name,
      "assets.bdag.community",
    );
    assert.equal(resources.AssetCertificate.Type, "AWS::CertificateManager::Certificate");
    assert.equal(resources.AssetCertificate.Condition, "CustomDomainEnabled");
    assert.equal(resources.AssetCertificate.Properties.DomainName, "assets.bdag.community");
    assert.equal(resources.AssetCertificate.Properties.ValidationMethod, "DNS");
    assert.deepEqual(distribution.Aliases, {
      "Fn::If": [
        "CustomDomainEnabled",
        ["assets.bdag.community"],
        { Ref: "AWS::NoValue" },
      ],
    });
    assert.equal(resources.AssetAliasRecord.Type, "AWS::Route53::RecordSet");
    assert.equal(resources.AssetAliasRecord.Condition, "CustomDomainEnabled");
    assert.equal(resources.AssetAliasRecord.Properties.Type, "A");
    assert.equal(resources.AssetAliasIpv6Record.Properties.Type, "AAAA");
  },
);

test(
  "delivery outputs support exact bucket-policy wiring and DNS delegation without secrets",
  { skip: !templateExists },
  () => {
    assert.ok(template.Outputs.AssetDistributionId);
    assert.ok(template.Outputs.AssetDistributionArn);
    assert.ok(template.Outputs.AssetDistributionDomainName);
    assert.ok(template.Outputs.AssetHostedZoneNameServers);
    assert.equal(
      template.Outputs.AssetHostedZoneNameServers.Condition,
      "IsProduction",
    );
  },
);

const delivery = readFileSync(
  new URL("../src/lib/news/article-asset-delivery.ts", import.meta.url),
  "utf8",
);
const articleImage = readFileSync(
  new URL("../src/components/news/ArticleImage.tsx", import.meta.url),
  "utf8",
);
const news = readFileSync(new URL("../src/lib/news.ts", import.meta.url), "utf8");
const nextConfig = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");

test("application delivery URLs are server-derived from exact UUID records", () => {
  assert.match(delivery, /ASSET_DELIVERY_ORIGIN/);
  assert.match(delivery, /ASSET_STORAGE_ENVIRONMENT/);
  assert.match(delivery, /assets\.bdag\.community/);
  assert.match(delivery, /cloudfront/);
  assert.match(delivery, /news\/published/);
  assert.match(delivery, /url\("640x360"\)/);
  assert.match(delivery, /url\("1024x576"\)/);
  assert.match(delivery, /url\("1600x900"\)/);
  assert.doesNotMatch(delivery, /NEXT_PUBLIC_/);
  assert.match(news, /published_asset_id/);
  assert.match(news, /published_asset_alt_text/);
  assert.match(news, /imageSrcSet/);
});

test("public rendering accepts only site artwork or the exact managed delivery host", () => {
  assert.match(articleImage, /src\.startsWith\("\/"\)/);
  assert.match(articleImage, /managed/);
  assert.match(articleImage, /srcSet/);
  assert.match(articleImage, /alt=\{alt\}/);
  assert.doesNotMatch(articleImage, /src=\{src\}[\s\S]*?https?:\/\//);
  assert.match(nextConfig, /ASSET_DELIVERY_ORIGIN/);
  assert.match(nextConfig, /remotePatterns/);
  assert.match(nextConfig, /news\/published/);
  assert.doesNotMatch(nextConfig, /hostname:\s*["']\*["']/);
});

const moderation = readFileSync(
  new URL("../src/lib/aws/article-asset-moderation.server.ts", import.meta.url),
  "utf8",
);

test("published copies are immutable and browser-cacheable", () => {
  assert.match(moderation, /CacheControl:\s*"public, max-age=31536000, immutable"/);
  assert.match(moderation, /MetadataDirective:\s*"REPLACE"/);
  assert.match(moderation, /derivative-sha256/);
  assert.match(moderation, /IfNoneMatch:\s*"\*"/);
  assert.doesNotMatch(moderation, /CacheControl:\s*"private, no-store"/);
});
