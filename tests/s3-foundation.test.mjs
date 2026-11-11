import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const templateUrl = new URL(
  "../infra/aws/s3-foundation.template.json",
  import.meta.url,
);
const verifierUrl = new URL(
  "../ops/verify-s3-foundation.sh",
  import.meta.url,
);
const templateExists = existsSync(templateUrl);
const verifierExists = existsSync(verifierUrl);

test("the reproducible Step 8 S3 foundation exists", () => {
  assert.equal(templateExists, true, "the CloudFormation template must exist");
  assert.equal(verifierExists, true, "the read-only verifier must exist");
});

const template = templateExists
  ? JSON.parse(readFileSync(templateUrl, "utf8"))
  : null;
const verifier = verifierExists ? readFileSync(verifierUrl, "utf8") : "";
const resources = template?.Resources ?? {};
const bucket = resources.AssetBucket?.Properties ?? {};
const intakeUser = resources.IntakeUser?.Properties ?? {};
const statements = intakeUser.Policies?.[0]?.PolicyDocument?.Statement ?? [];

test(
  "the template is account-neutral and creates isolated development or production resources",
  { skip: !templateExists },
  () => {
    assert.deepEqual(template.Parameters.Environment.AllowedValues, [
      "development",
      "production",
    ]);
    assert.deepEqual(template.Mappings.EnvironmentConfig, {
      development: { AllowedOrigin: "http://localhost:3011" },
      production: { AllowedOrigin: "https://bdag.community" },
    });
    assert.deepEqual(bucket.BucketName, {
      "Fn::Sub":
        "bdag-community-assets-${Environment}-${AWS::AccountId}-${AWS::Region}",
    });

    const source = JSON.stringify(template);
    assert.doesNotMatch(source, /\b\d{12}\b/);
    assert.doesNotMatch(source, /AKIA[0-9A-Z]{16}|aws_secret_access_key/i);
  },
);

test(
  "both asset buckets stay private, owner-enforced, encrypted, and versioned",
  { skip: !templateExists },
  () => {
    assert.deepEqual(bucket.PublicAccessBlockConfiguration, {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    });
    assert.deepEqual(bucket.OwnershipControls, {
      Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }],
    });
    assert.equal(
      bucket.BucketEncryption.ServerSideEncryptionConfiguration[0]
        .ServerSideEncryptionByDefault.SSEAlgorithm,
      "AES256",
    );
    assert.equal(bucket.VersioningConfiguration.Status, "Enabled");
    assert.equal(resources.AssetBucket.DeletionPolicy, "Retain");
    assert.equal(resources.AssetBucket.UpdateReplacePolicy, "Retain");

    const policy = resources.AssetBucketPolicy.Properties.PolicyDocument;
    const tlsDeny = policy.Statement.find(
      (statement) => statement.Sid === "DenyInsecureTransport",
    );
    assert.equal(tlsDeny.Effect, "Deny");
    assert.deepEqual(tlsDeny.Principal, { AWS: "*" });
    assert.equal(tlsDeny.Condition.Bool["aws:SecureTransport"], "false");
    const deliveryRead = policy.Statement.find(
      (statement) => statement?.["Fn::If"]?.[1]?.Sid === "AllowCloudFrontPublishedReads",
    )?.["Fn::If"]?.[1];
    assert.equal(deliveryRead.Principal.Service, "cloudfront.amazonaws.com");
    assert.equal(deliveryRead.Action, "s3:GetObject");
    assert.deepEqual(deliveryRead.Resource, {
      "Fn::Sub": "${AssetBucket.Arn}/news/published/*",
    });
    assert.deepEqual(deliveryRead.Condition.StringEquals["AWS:SourceArn"], {
      Ref: "AssetDeliveryDistributionArn",
    });
    assert.equal(
      policy.Statement.some(
        (statement) => statement?.Effect === "Allow" && statement.Principal === "*",
      ),
      false,
      "the bucket policy must never grant public access",
    );
    const processedMissing = policy.Statement.find(
      (statement) => statement.Sid === "DenyMissingProcessedWriteCondition",
    );
    const processedWrong = policy.Statement.find(
      (statement) => statement.Sid === "DenyIncorrectProcessedWriteCondition",
    );
    assert.equal(
      processedMissing.Condition.Null["s3:if-none-match"],
      "true",
    );
    assert.equal(
      processedWrong.Condition.StringNotEquals["s3:if-none-match"],
      "*",
    );
  },
);

test(
  "untrusted and abandoned objects have bounded retention without expiring published assets",
  { skip: !templateExists },
  () => {
    const rules = bucket.LifecycleConfiguration.Rules;
    const quarantine = rules.find(
      (rule) => rule.Id === "ExpireQuarantineObjects",
    );
    const rejected = rules.find((rule) => rule.Id === "ExpireRejectedObjects");
    const incomplete = rules.find(
      (rule) => rule.Id === "AbortIncompleteMultipartUploads",
    );

    assert.equal(quarantine.Prefix, "news/quarantine/");
    assert.equal(quarantine.ExpirationInDays, 7);
    assert.equal(quarantine.NoncurrentVersionExpiration.NoncurrentDays, 7);
    assert.equal(rejected.Prefix, "news/rejected/");
    assert.equal(rejected.ExpirationInDays, 30);
    assert.equal(rejected.NoncurrentVersionExpiration.NoncurrentDays, 30);
    assert.equal(incomplete.AbortIncompleteMultipartUpload.DaysAfterInitiation, 1);
    assert.equal(
      rules.some(
        (rule) =>
          /news\/(processed|published)\//.test(rule.Prefix ?? "") &&
          (rule.ExpirationInDays || rule.Expiration),
      ),
      false,
    );
  },
);

test(
  "browser CORS is conditional-PUT-only and resolves to one exact environment origin",
  { skip: !templateExists },
  () => {
    const cors = bucket.CorsConfiguration.CorsRules;
    assert.equal(cors.length, 1);
    assert.deepEqual(cors[0].AllowedMethods, ["PUT"]);
    assert.deepEqual(cors[0].AllowedHeaders, ["Content-Type", "If-None-Match"]);
    assert.equal(cors[0].MaxAge, 300);
    assert.deepEqual(cors[0].AllowedOrigins, [
      {
        "Fn::FindInMap": [
          "EnvironmentConfig",
          { Ref: "Environment" },
          "AllowedOrigin",
        ],
      },
    ]);
    assert.doesNotMatch(JSON.stringify(cors), /"\*"/);
  },
);

test(
  "the intake identity can write only quarantine objects and has no credential resource",
  { skip: !templateExists },
  () => {
    const quarantine = statements.find(
      (statement) => statement.Sid === "WriteQuarantineObjects",
    );

    assert.deepEqual(quarantine.Action, ["s3:PutObject"]);
    assert.deepEqual(quarantine.Resource, {
      "Fn::Sub": "${AssetBucket.Arn}/news/quarantine/*",
    });
    assert.deepEqual(
      statements.flatMap((statement) => statement.Action),
      ["s3:PutObject"],
    );
    assert.equal(quarantine.Condition.StringEquals["s3:if-none-match"], "*");
    assert.equal(
      Object.values(resources).some(
        (resource) => resource.Type === "AWS::IAM::AccessKey",
      ),
      false,
    );
    assert.equal(intakeUser.LoginProfile, undefined);
  },
);

test(
  "the bucket stack delegates published reads only to an external controlled distribution",
  { skip: !templateExists },
  () => {
    const types = Object.values(resources).map((resource) => resource.Type);
    assert.equal(types.some((type) => /CloudFront/.test(type)), false);
    assert.equal(template.Parameters.AssetDeliveryDistributionArn.Default, "");
    assert.equal(
      Object.entries(resources)
        .filter(([, resource]) => /Lambda/.test(resource.Type))
        .every(
          ([, resource]) =>
            resource.Condition === "ProcessorResourcesEnabled",
        ),
      true,
    );
    assert.doesNotMatch(JSON.stringify(template), /AWS::IAM::AccessKey/);
  },
);

test(
  "the verifier proves the live private boundary without printing credentials",
  { skip: !verifierExists },
  () => {
    assert.match(verifier, /get-public-access-block/);
    assert.match(verifier, /get-bucket-encryption/);
    assert.match(verifier, /get-bucket-versioning/);
    assert.match(verifier, /get-bucket-lifecycle-configuration/);
    assert.match(verifier, /ExpireQuarantineObjects[\s\S]*Expiration\.Days/);
    assert.match(verifier, /ExpireRejectedObjects[\s\S]*Expiration\.Days/);
    assert.match(
      verifier,
      /AbortIncompleteMultipartUploads[\s\S]*DaysAfterInitiation/,
    );
    assert.match(verifier, /Enabled\\tnews\/quarantine\/\\t7\\t7/);
    assert.match(verifier, /Enabled\\tnews\/rejected\/\\t30\\t30/);
    assert.match(verifier, /Enabled\\tnews\/\\t1/);
    assert.match(verifier, /get-bucket-cors/);
    assert.match(verifier, /length\(CORSRules\)/);
    assert.match(verifier, /AllowedOrigins/);
    assert.match(verifier, /AllowedMethods/);
    assert.match(verifier, /AllowedHeaders/);
    assert.match(verifier, /MaxAgeSeconds/);
    assert.match(
      verifier,
      /expected_origin[\s\S]*PUT[\s\S]*Content-Type[\s\S]*If-None-Match[\s\S]*300/,
    );
    assert.match(verifier, /simulate-principal-policy/);
    assert.match(verifier, /--resource-policy/);
    assert.match(verifier, /missing[\s\S]*wrong-condition[\s\S]*stale[\s\S]*wrong-auth[\s\S]*wrong-signature/);
    assert.match(
      verifier,
      /s3:GetObject[\s\S]*s3:DeleteObject[\s\S]*s3:ListBucket[\s\S]*s3:GetBucketLocation/,
    );
    assert.match(verifier, /eu-central-1/);
    assert.match(verifier, /runtime-ready/);
    assert.match(verifier, /intake-ready/);
    assert.match(verifier, /EnableProcessorNotification/);
    assert.match(verifier, /EnableProcessorResources/);
    assert.doesNotMatch(verifier, /Production must remain credential-free/);
    assert.match(verifier, /get-bucket-notification-configuration/);
    assert.match(verifier, /ModeratorUserArn/);
    assert.match(verifier, /moderator_user_arn/);
    assert.match(
      verifier,
      /news\/processed\/verification\/result\.json[\s\S]*news\/published\/verification\/cover\.webp/,
    );
    assert.match(
      verifier,
      /news\/quarantine\/verification\/original[\s\S]*s3:ListBucket[\s\S]*s3:DeleteObject/,
    );
    assert.match(verifier, /s3:DeleteObjectVersion/);
    assert.match(verifier, /s3:x-amz-copy-source/);
    assert.match(
      verifier,
      /s3:x-amz-copy-source[\s\S]*s3:x-amz-metadata-directive[\s\S]*s3:if-none-match/,
    );
    assert.match(
      verifier,
      /moderator_denied_copy_context[\s\S]*missing-copy-source[\s\S]*wrong-copy-source[\s\S]*missing-metadata-directive[\s\S]*wrong-metadata-directive[\s\S]*missing-write-condition[\s\S]*wrong-write-condition/,
    );
    assert.match(verifier, /news\/quarantine\/verification\/allowed/);
    assert.match(verifier, /news\/published\/verification\/denied/);
    assert.match(verifier, /curl[\s\S]*--write-out/);
    assert.doesNotMatch(verifier, /get-access-key|create-access-key|secret-access-key/i);
  },
);
