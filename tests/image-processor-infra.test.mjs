import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const template = JSON.parse(
  readFileSync(
    new URL("../infra/aws/s3-foundation.template.json", import.meta.url),
    "utf8",
  ),
);
const resources = template.Resources;

test("each enabled environment requires an immutable external processor package", () => {
  assert.deepEqual(template.Conditions.IsDevelopment, {
    "Fn::Equals": [{ Ref: "Environment" }, "development"],
  });
  assert.deepEqual(template.Parameters.EnableProcessorResources, {
    Type: "String",
    AllowedValues: ["false", "true"],
    Default: "false",
    Description:
      "Create the isolated moderator identity, processor, logs, and failure queue for this environment.",
  });
  assert.ok(template.Parameters.ProcessorCodeBucket);
  assert.ok(template.Parameters.ProcessorCodeKey);
  assert.ok(template.Parameters.ProcessorCodeVersion);
  assert.deepEqual(template.Parameters.EnableProcessorNotification, {
    Type: "String",
    AllowedValues: ["false", "true"],
    Default: "false",
    Description:
      "Enable the S3 notification after this environment's processor permission exists.",
  });
  assert.ok(template.Rules.EnabledProcessorPackageRequired);
  assert.ok(template.Rules.ProcessorNotificationRequiresResources);
  assert.deepEqual(template.Conditions.ProcessorResourcesEnabled, {
    "Fn::Equals": [{ Ref: "EnableProcessorResources" }, "true"],
  });
  assert.deepEqual(template.Conditions.ProcessorNotificationEnabled, {
    "Fn::And": [
      { Condition: "ProcessorResourcesEnabled" },
      {
        "Fn::Equals": [
          { Ref: "EnableProcessorNotification" },
          "true",
        ],
      },
    ],
  });

  const processorResources = Object.entries(resources).filter(([name]) =>
    name.startsWith("Processor"),
  );
  assert.ok(processorResources.length >= 6);
  for (const [name, resource] of processorResources) {
    assert.equal(
      resource.Condition,
      "ProcessorResourcesEnabled",
      `${name} must be environment-gated`,
    );
  }
});

test("an enabled environment includes a credential-free moderator identity with exact cleanup access", () => {
  const moderator = resources.ModeratorUser;
  assert.equal(moderator.Condition, "ProcessorResourcesEnabled");
  assert.equal(moderator.Type, "AWS::IAM::User");
  assert.equal(moderator.Properties.LoginProfile, undefined);
  const statements = moderator.Properties.Policies.flatMap(
    (policy) => policy.PolicyDocument.Statement,
  );
  const processedRead = statements.find(
    (statement) => statement.Sid === "ReadProcessedAssets",
  );
  assert.deepEqual(processedRead.Action, ["s3:GetObject", "s3:GetObjectVersion"]);
  assert.deepEqual(processedRead.Resource, {
    "Fn::Sub": "${AssetBucket.Arn}/news/processed/*",
  });

  const publish = statements.find(
    (statement) => statement.Sid === "PublishProcessedCopies",
  );
  assert.equal(publish.Action, "s3:PutObject");
  assert.equal(publish.Condition.StringEquals["s3:if-none-match"], "*");
  assert.equal(
    publish.Condition.StringEquals["s3:x-amz-metadata-directive"],
    "REPLACE",
  );
  assert.deepEqual(publish.Condition.StringLike["s3:x-amz-copy-source"], {
    "Fn::Sub": "${AssetBucket}/news/processed/*",
  });

  const recovery = statements.find(
    (statement) => statement.Sid === "RecoverPublishedVersions",
  );
  assert.equal(recovery.Action, "s3:GetObject");
  assert.deepEqual(recovery.Resource, {
    "Fn::Sub": "${AssetBucket.Arn}/news/published/*",
  });

  const cleanup = statements.find(
    (statement) => statement.Sid === "DeleteExactManagedAssetVersions",
  );
  assert.equal(cleanup.Action, "s3:DeleteObjectVersion");
  assert.deepEqual(
    cleanup.Resource.map((resource) => resource["Fn::Sub"]).sort(),
    [
      "${AssetBucket.Arn}/news/processed/*",
      "${AssetBucket.Arn}/news/published/*",
      "${AssetBucket.Arn}/news/quarantine/*",
    ],
  );

  const source = JSON.stringify(moderator.Properties.Policies);
  assert.doesNotMatch(
    source,
    /s3:ListBucket|s3:GetObjectVersionAttributes|s3:DeleteObject"/,
  );
  assert.equal(
    statements.some((statement) => {
      const actions = Array.isArray(statement.Action)
        ? statement.Action
        : [statement.Action];
      return (
        actions.some((action) => action.startsWith("s3:GetObject")) &&
        JSON.stringify(statement.Resource).includes("news/quarantine/")
      );
    }),
    false,
  );
  assert.equal(
    Object.values(resources).some(
      (resource) => resource.Type === "AWS::IAM::AccessKey",
    ),
    false,
  );
});

test("an enabled environment invokes one bounded ARM Lambda directly from quarantine PUTs", () => {
  const fn = resources.ProcessorFunction.Properties;
  assert.equal(fn.Runtime, "nodejs24.x");
  assert.deepEqual(fn.Architectures, ["arm64"]);
  assert.equal(fn.Handler, "dist/index.handler");
  assert.equal(fn.MemorySize, 2048);
  assert.equal(fn.Timeout, 30);
  assert.equal(
    fn.ReservedConcurrentExecutions,
    undefined,
    "this shared account cannot reserve Lambda concurrency without violating AWS's minimum unreserved pool",
  );
  assert.deepEqual(fn.Code, {
    S3Bucket: { Ref: "ProcessorCodeBucket" },
    S3Key: { Ref: "ProcessorCodeKey" },
    S3ObjectVersion: { Ref: "ProcessorCodeVersion" },
  });

  const notificationCondition =
    resources.AssetBucket.Properties.NotificationConfiguration["Fn::If"];
  assert.equal(notificationCondition[0], "ProcessorNotificationEnabled");
  assert.deepEqual(notificationCondition[2], { Ref: "AWS::NoValue" });
  const notification = notificationCondition[1].LambdaConfigurations;
  assert.equal(notification.length, 1);
  assert.equal(notification[0].Event, "s3:ObjectCreated:Put");
  assert.deepEqual(notification[0].Filter.S3Key.Rules, [
    { Name: "prefix", Value: "news/quarantine/" },
    { Name: "suffix", Value: "/original" },
  ]);
  assert.equal(resources.AssetBucket.DependsOn, undefined);

  const roleSource = JSON.stringify(resources.ProcessorExecutionRole);
  const environmentSource = JSON.stringify(fn.Environment);
  assert.doesNotMatch(roleSource, /\$\{AssetBucket/);
  assert.doesNotMatch(environmentSource, /"Ref":"AssetBucket"/);

  const permission = resources.ProcessorInvokePermission.Properties;
  assert.equal(permission.Principal, "s3.amazonaws.com");
  assert.equal(permission.Action, "lambda:InvokeFunction");
  assert.deepEqual(permission.SourceAccount, { Ref: "AWS::AccountId" });
  assert.deepEqual(permission.SourceArn, {
    "Fn::Sub":
      "arn:${AWS::Partition}:s3:::bdag-community-assets-${Environment}-${AWS::AccountId}-${AWS::Region}",
  });
});

test("processor outputs support production operations without exposing credentials", () => {
  for (const name of [
    "ModeratorUserArn",
    "ProcessorFunctionName",
    "ProcessorFunctionArn",
    "ProcessorFailureQueueUrl",
    "ProcessorFailureQueueArn",
  ]) {
    assert.equal(template.Outputs[name].Condition, "ProcessorResourcesEnabled");
  }
  assert.doesNotMatch(JSON.stringify(template.Outputs), /AccessKey|Secret/i);
});

test("processor failures are bounded, encrypted, retained, and sent to SQS", () => {
  const queue = resources.ProcessorFailureQueue.Properties;
  assert.equal(queue.KmsMasterKeyId, "alias/aws/sqs");
  assert.equal(queue.MessageRetentionPeriod, 1209600);

  const eventConfig = resources.ProcessorEventInvokeConfig.Properties;
  assert.equal(eventConfig.Qualifier, "$LATEST");
  assert.equal(eventConfig.MaximumRetryAttempts, 1);
  assert.equal(eventConfig.MaximumEventAgeInSeconds, 3600);
  assert.deepEqual(eventConfig.DestinationConfig.OnFailure.Destination, {
    "Fn::GetAtt": ["ProcessorFailureQueue", "Arn"],
  });

  const logs = resources.ProcessorLogGroup.Properties;
  assert.equal(logs.RetentionInDays, 14);
});

test("the processor role reads quarantine and writes processed assets only", () => {
  const role = resources.ProcessorExecutionRole.Properties;
  const statements = role.Policies.flatMap(
    (policy) => policy.PolicyDocument.Statement,
  );
  const source = JSON.stringify(role);
  const actions = statements.flatMap((statement) =>
    Array.isArray(statement.Action) ? statement.Action : [statement.Action],
  );

  assert.deepEqual(
    actions.toSorted(),
    [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "s3:GetObject",
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:GetObjectVersion",
      "s3:PutObject",
      "sqs:SendMessage",
    ].toSorted(),
  );
  assert.match(source, /news\/quarantine\/\*/);
  assert.match(source, /news\/processed\/\*/);
  const processedWrite = statements.find(
    (statement) => statement.Sid === "WriteImmutableProcessedResults",
  );
  assert.deepEqual(processedWrite.Action, "s3:PutObject");
  assert.equal(processedWrite.Condition.StringEquals["s3:if-none-match"], "*");
  assert.doesNotMatch(source, /news\/published\/|s3:Delete|s3:List/);
  assert.doesNotMatch(
    source,
    /secretsmanager|ssm:|rds:|dynamodb:|execute-api:/i,
  );

  const environment = resources.ProcessorFunction.Properties.Environment;
  assert.deepEqual(Object.keys(environment.Variables).toSorted(), [
    "ASSET_BUCKET",
    "ASSET_ENVIRONMENT",
    "PROCESSED_PREFIX",
    "QUARANTINE_PREFIX",
  ]);
  assert.doesNotMatch(JSON.stringify(environment), /secret|supabase|database|url/i);
  assert.equal(
    Object.values(resources).some((resource) =>
      /CloudFront|Rekognition/.test(resource.Type),
    ),
    false,
  );
});
