import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  lstatSync,
  readlinkSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const helperUrl = new URL("../ops/configure-asset-intake.sh", import.meta.url);
const helperExists = existsSync(helperUrl);
const helper = helperExists ? readFileSync(helperUrl, "utf8") : "";
const runtimeConfig = readFileSync(
  new URL("../src/lib/aws/article-asset-config.server.ts", import.meta.url),
  "utf8",
);
const envExample = readFileSync(
  new URL("../.env.local.example", import.meta.url),
  "utf8",
);
const dockerfile = readFileSync(
  new URL("../Dockerfile", import.meta.url),
  "utf8",
);
const dockerCompose = readFileSync(
  new URL("../docker-compose.yml", import.meta.url),
  "utf8",
);

const fakeAccessKeyId = "AKIAIOSFODNN7EXAMPLE";
const fakeSecretAccessKey = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/+==";
const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fakeCredentialPattern = new RegExp(
  `${escapeRegex(fakeAccessKeyId)}|${escapeRegex(fakeSecretAccessKey)}`,
);

test("Docker documentation preserves the exact local review rebuild command", () => {
  for (const source of [dockerfile, dockerCompose]) {
    assert.match(source, /docker compose up --build -d/);
    assert.doesNotMatch(source, /docker compose --env-file \.env\.local up --build -d/);
  }
});

function makeFixture({ envSource = "UNCHANGED=value\n" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "bdag-asset-intake-"));
  const ops = join(root, "ops");
  const bin = join(root, "bin");
  mkdirSync(ops);
  mkdirSync(bin);
  copyFileSync(helperUrl, join(ops, "configure-asset-intake.sh"));
  writeFileSync(join(root, ".gitignore"), ".env.local\n");
  writeFileSync(join(root, ".env.local"), envSource, { mode: 0o644 });
  execFileSync("git", ["init", "-q"], { cwd: root });

  const awsLog = join(root, "aws.log");
  const fakeAws = join(bin, "aws");
  writeFileSync(
    fakeAws,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >>"$FAKE_AWS_LOG"
scenario="\${FAKE_AWS_SCENARIO:-ok}"
args="$*"
case "$args" in
  "configure get region --profile test-profile")
    [[ "$scenario" == "wrong-region" ]] && printf '%s\\n' eu-west-1 || printf '%s\\n' eu-central-1
    ;;
  *"sts get-caller-identity"*) printf '%s\\n' 123456789012 ;;
  *"cloudformation describe-stacks"*"Stacks[0].StackStatus"*) printf '%s\\n' UPDATE_COMPLETE ;;
  *"cloudformation describe-stacks"*"ParameterKey=='Environment'"*)
    [[ "$scenario" == "wrong-stack-environment" ]] && printf '%s\\n' production || printf '%s\\n' development
    ;;
  *"cloudformation describe-stacks"*"AssetBucketName"*) printf '%s\\n' bdag-community-assets-development-123456789012-eu-central-1 ;;
  *"cloudformation describe-stacks"*"IntakeUserArn"*)
    [[ "$scenario" == "wrong-user" ]] && printf '%s\\n' arn:aws:iam::123456789012:user/bdag-community/other-user || printf '%s\\n' arn:aws:iam::123456789012:user/bdag-community/bdag-community-assets-development-intake
    ;;
  *"iam get-user"*) printf '%s\\n' $'arn:aws:iam::123456789012:user/bdag-community/bdag-community-assets-development-intake\\t/bdag-community/\\tbdag-community-assets-development-intake' ;;
  *"iam list-access-keys"*"Status=='Active'"*)
    [[ "$scenario" == "import-key-mismatch" ]] && printf '%s\\n' AKIAZZZZZZZZZZZZZZZZ || printf '%s\\n' ${fakeAccessKeyId}
    ;;
  *"iam list-access-keys"*)
    if [[ "\${FAKE_AWS_IMPORT_MODE:-}" == "1" ]]; then
      printf '%s\\n' 1
    elif [[ "$scenario" == "existing-key" ]]; then
      printf '%s\\n' 1
    elif [[ "$scenario" == "concurrent-key" && "$(grep -c 'iam list-access-keys' "$FAKE_AWS_LOG")" -gt 1 ]]; then
      printf '%s\\n' 2
    elif [[ "$(grep -c 'iam list-access-keys' "$FAKE_AWS_LOG")" -gt 1 ]]; then
      printf '%s\\n' 1
    else
      printf '%s\\n' 0
    fi
    ;;
  *"iam create-access-key"*)
    printf '%s\\n' '{"AccessKey":{"UserName":"bdag-community-assets-development-intake","AccessKeyId":"${fakeAccessKeyId}","SecretAccessKey":"${fakeSecretAccessKey}"}}'
    ;;
  *"iam delete-access-key"*) ;;
  *) printf '%s\\n' "unexpected fake aws call" >&2; exit 90 ;;
esac
`,
  );
  chmodSync(fakeAws, 0o755);

  return { root, awsLog, envFile: join(root, ".env.local"), bin };
}

function runHelper(fixture, environment = "development", scenario = "ok") {
  return spawnSync(
    "bash",
    [join(fixture.root, "ops/configure-asset-intake.sh"), environment, "test-profile"],
    {
      cwd: fixture.root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fixture.bin}:${process.env.PATH}`,
        FAKE_AWS_LOG: fixture.awsLog,
        FAKE_AWS_SCENARIO: scenario,
      },
    },
  );
}

function writeCredentialCsv(
  fixture,
  {
    source = `User name,Access key ID,Secret access key\nbdag-community-assets-development-intake,${fakeAccessKeyId},${fakeSecretAccessKey}\n`,
    mode = 0o600,
    name = "development-intake.csv",
  } = {},
) {
  const csvPath = join(fixture.root, name);
  writeFileSync(csvPath, source, { mode });
  chmodSync(csvPath, mode);
  return csvPath;
}

function runImportHelper(fixture, csvPath, scenario = "import-ok") {
  return spawnSync(
    "bash",
    [
      join(fixture.root, "ops/configure-asset-intake.sh"),
      "development",
      "test-profile",
      "--from-csv",
      csvPath,
    ],
    {
      cwd: fixture.root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fixture.bin}:${process.env.PATH}`,
        FAKE_AWS_LOG: fixture.awsLog,
        FAKE_AWS_SCENARIO: scenario,
        FAKE_AWS_IMPORT_MODE: "1",
      },
    },
  );
}

test("the development-only asset intake helper exists", () => {
  assert.equal(helperExists, true);
});

test(
  "the helper creates one key, preserves unrelated env, and emits no credentials",
  { skip: !helperExists },
  () => {
    const original = [
      "# existing local settings",
      "UNCHANGED=value",
      "ABUSE_HMAC_SECRET=independent-existing-abuse-secret-value",
      "ASSET_S3_REGION=wrong-region",
      "",
    ].join("\n");
    const fixture = makeFixture({ envSource: original });
    const result = runHelper(fixture);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout,
      "Development asset intake runtime configured securely.\n",
    );
    assert.equal(result.stderr, "");
    assert.doesNotMatch(
      `${result.stdout}${result.stderr}`,
      fakeCredentialPattern,
    );

    const env = readFileSync(fixture.envFile, "utf8");
    assert.match(env, /^# existing local settings$/m);
    assert.match(env, /^UNCHANGED=value$/m);
    assert.match(
      env,
      /^ABUSE_HMAC_SECRET=independent-existing-abuse-secret-value$/m,
    );
    assert.match(env, /^ASSET_STORAGE_ENVIRONMENT=development$/m);
    assert.match(env, /^ASSET_S3_REGION=eu-central-1$/m);
    assert.match(
      env,
      /^ASSET_S3_BUCKET=bdag-community-assets-development-123456789012-eu-central-1$/m,
    );
    assert.match(env, new RegExp(`^ASSET_S3_ACCESS_KEY_ID=${escapeRegex(fakeAccessKeyId)}$`, "m"));
    assert.match(
      env,
      new RegExp(`^ASSET_S3_SECRET_ACCESS_KEY=${escapeRegex(fakeSecretAccessKey)}$`, "m"),
    );
    const capability = env.match(/^ASSET_CAPABILITY_HMAC_SECRET=(.+)$/m)?.[1];
    assert.match(capability ?? "", /^[a-f0-9]{64}$/);
    assert.notEqual(capability, "independent-existing-abuse-secret-value");
    assert.equal(statSync(fixture.envFile).mode & 0o777, 0o600);
    const composeEnv = join(fixture.root, ".env");
    assert.equal(lstatSync(composeEnv).isSymbolicLink(), true);
    assert.equal(readlinkSync(composeEnv), ".env.local");

    const awsCalls = readFileSync(fixture.awsLog, "utf8");
    assert.equal((awsCalls.match(/iam create-access-key/g) ?? []).length, 1);
    assert.match(awsCalls, /cloudformation describe-stacks/);
    assert.match(awsCalls, /iam get-user/);
    assert.match(awsCalls, /iam list-access-keys/);
    assert.doesNotMatch(awsCalls, new RegExp(escapeRegex(fakeSecretAccessKey)));
  },
);

test(
  "the helper refuses production before calling AWS or changing env",
  { skip: !helperExists },
  () => {
    const fixture = makeFixture();
    const before = readFileSync(fixture.envFile, "utf8");
    const result = runHelper(fixture, "production");

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /development only/i);
    assert.equal(readFileSync(fixture.envFile, "utf8"), before);
    assert.equal(existsSync(fixture.awsLog), false);
  },
);

test(
  "the helper refuses an intake user that already has any access key",
  { skip: !helperExists },
  () => {
    const fixture = makeFixture();
    const before = readFileSync(fixture.envFile, "utf8");
    const result = runHelper(fixture, "development", "existing-key");

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /already has an access key/i);
    assert.equal(readFileSync(fixture.envFile, "utf8"), before);
    assert.doesNotMatch(readFileSync(fixture.awsLog, "utf8"), /create-access-key/);
  },
);

test(
  "the helper preserves an existing valid independent capability secret",
  { skip: !helperExists },
  () => {
    const existingCapability = "c".repeat(64);
    const fixture = makeFixture({
      envSource: [
        `ASSET_CAPABILITY_HMAC_SECRET=${existingCapability}`,
        `ABUSE_HMAC_SECRET=${"a".repeat(64)}`,
        "",
      ].join("\n"),
    });
    const result = runHelper(fixture);

    assert.equal(result.status, 0, result.stderr);
    assert.match(
      readFileSync(fixture.envFile, "utf8"),
      new RegExp(`^ASSET_CAPABILITY_HMAC_SECRET=${existingCapability}$`, "m"),
    );
  },
);

for (const [name, envSource, expectedError] of [
  [
    "short capability secret",
    "ASSET_CAPABILITY_HMAC_SECRET=too-short\n",
    /too short/i,
  ],
  [
    "shared abuse and capability secret",
    `ABUSE_HMAC_SECRET=${"s".repeat(64)}\nASSET_CAPABILITY_HMAC_SECRET=${"s".repeat(64)}\n`,
    /independent/i,
  ],
]) {
  test(
    `the helper refuses a ${name} before key creation`,
    { skip: !helperExists },
    () => {
      const fixture = makeFixture({ envSource });
      const before = readFileSync(fixture.envFile, "utf8");
      const result = runHelper(fixture);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expectedError);
      assert.equal(readFileSync(fixture.envFile, "utf8"), before);
      assert.doesNotMatch(readFileSync(fixture.awsLog, "utf8"), /create-access-key/);
    },
  );
}

test(
  "the helper removes the new key if the atomic env write cannot start",
  { skip: !helperExists },
  () => {
    const fixture = makeFixture();
    const fakeMktemp = join(fixture.bin, "mktemp");
    writeFileSync(fakeMktemp, "#!/usr/bin/env bash\nexit 72\n");
    chmodSync(fakeMktemp, 0o755);
    const result = runHelper(fixture);

    assert.notEqual(result.status, 0);
    assert.doesNotMatch(
      `${result.stdout}${result.stderr}`,
      fakeCredentialPattern,
    );
    const awsCalls = readFileSync(fixture.awsLog, "utf8");
    assert.equal((awsCalls.match(/iam create-access-key/g) ?? []).length, 1);
    assert.equal((awsCalls.match(/iam delete-access-key/g) ?? []).length, 1);
  },
);

test(
  "the helper removes its new key if a concurrent key appears",
  { skip: !helperExists },
  () => {
    const fixture = makeFixture();
    const before = readFileSync(fixture.envFile, "utf8");
    const result = runHelper(fixture, "development", "concurrent-key");

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exactly one access key/i);
    assert.equal(readFileSync(fixture.envFile, "utf8"), before);
    const awsCalls = readFileSync(fixture.awsLog, "utf8");
    assert.equal((awsCalls.match(/iam create-access-key/g) ?? []).length, 1);
    assert.equal((awsCalls.match(/iam delete-access-key/g) ?? []).length, 1);
  },
);

test(
  "console CSV import validates the live key, configures env, and removes the CSV without disclosure",
  { skip: !helperExists },
  () => {
    const fixture = makeFixture({ envSource: "UNCHANGED=console-import\n" });
    const csvPath = writeCredentialCsv(fixture);
    const result = runImportHelper(fixture, csvPath);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout,
      "Development asset intake runtime configured securely.\n",
    );
    assert.equal(result.stderr, "");
    assert.doesNotMatch(
      `${result.stdout}${result.stderr}`,
      fakeCredentialPattern,
    );
    assert.equal(existsSync(csvPath), false);
    const env = readFileSync(fixture.envFile, "utf8");
    assert.match(env, /^UNCHANGED=console-import$/m);
    assert.match(env, new RegExp(`^ASSET_S3_ACCESS_KEY_ID=${escapeRegex(fakeAccessKeyId)}$`, "m"));
    assert.match(
      env,
      new RegExp(`^ASSET_S3_SECRET_ACCESS_KEY=${escapeRegex(fakeSecretAccessKey)}$`, "m"),
    );
    assert.equal(statSync(fixture.envFile).mode & 0o777, 0o600);
    const awsCalls = readFileSync(fixture.awsLog, "utf8");
    assert.doesNotMatch(awsCalls, /create-access-key|delete-access-key/);
    assert.match(awsCalls, /iam list-access-keys/);
  },
);

test(
  "console CSV import accepts the exact two-column AWS download format",
  { skip: !helperExists },
  () => {
    const fixture = makeFixture();
    const csvPath = writeCredentialCsv(fixture, {
      source: `Access key ID,Secret access key\n${fakeAccessKeyId},${fakeSecretAccessKey}\n`,
      mode: 0o400,
    });
    const result = runImportHelper(fixture, csvPath);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(csvPath), false);
  },
);

for (const [name, source, expectedError] of [
  [
    "unexpected headers",
    `AccessKey,Secret\n${fakeAccessKeyId},${fakeSecretAccessKey}\n`,
    /CSV format/i,
  ],
  [
    "more than one credential row",
    `Access key ID,Secret access key\n${fakeAccessKeyId},${fakeSecretAccessKey}\n${fakeAccessKeyId},${fakeSecretAccessKey}\n`,
    /exactly one credential row/i,
  ],
  [
    "a different intake username",
    `User name,Access key ID,Secret access key\nother-user,${fakeAccessKeyId},${fakeSecretAccessKey}\n`,
    /intake username/i,
  ],
  [
    "an invalid access key ID",
    `Access key ID,Secret access key\nnot-a-key,${fakeSecretAccessKey}\n`,
    /credential values/i,
  ],
]) {
  test(
    `console CSV import refuses ${name}`,
    { skip: !helperExists },
    () => {
      const fixture = makeFixture();
      const csvPath = writeCredentialCsv(fixture, { source });
      const before = readFileSync(fixture.envFile, "utf8");
      const result = runImportHelper(fixture, csvPath);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expectedError);
      assert.doesNotMatch(
        `${result.stdout}${result.stderr}`,
        fakeCredentialPattern,
      );
      assert.equal(existsSync(csvPath), true);
      assert.equal(readFileSync(fixture.envFile, "utf8"), before);
      assert.equal(existsSync(fixture.awsLog), false);
    },
  );
}

test(
  "console CSV import refuses a relative, linked, or overly broad credential file",
  { skip: !helperExists },
  () => {
    for (const kind of ["relative", "symlink", "world-readable"]) {
      const fixture = makeFixture();
      const secureCsv = writeCredentialCsv(fixture);
      let csvPath = secureCsv;
      if (kind === "relative") csvPath = "development-intake.csv";
      if (kind === "symlink") {
        csvPath = join(fixture.root, "credential-link.csv");
        execFileSync("ln", ["-s", secureCsv, csvPath]);
      }
      if (kind === "world-readable") chmodSync(csvPath, 0o644);

      const result = runImportHelper(fixture, csvPath);
      assert.notEqual(result.status, 0, kind);
      assert.match(result.stderr, /absolute regular file|permissions/i, kind);
      assert.equal(existsSync(secureCsv), true, kind);
      assert.equal(existsSync(fixture.awsLog), false, kind);
    }
  },
);

test(
  "console CSV import refuses a live key mismatch without removing local files",
  { skip: !helperExists },
  () => {
    const fixture = makeFixture();
    const csvPath = writeCredentialCsv(fixture);
    const before = readFileSync(fixture.envFile, "utf8");
    const result = runImportHelper(fixture, csvPath, "import-key-mismatch");

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /single active key does not match/i);
    assert.equal(existsSync(csvPath), true);
    assert.equal(readFileSync(fixture.envFile, "utf8"), before);
    assert.doesNotMatch(readFileSync(fixture.awsLog, "utf8"), /delete-access-key/);
  },
);

test(
  "console CSV import keeps the key and CSV when the local atomic write fails",
  { skip: !helperExists },
  () => {
    const fixture = makeFixture();
    const csvPath = writeCredentialCsv(fixture);
    const before = readFileSync(fixture.envFile, "utf8");
    const fakeMktemp = join(fixture.bin, "mktemp");
    writeFileSync(fakeMktemp, "#!/usr/bin/env bash\nexit 72\n");
    chmodSync(fakeMktemp, 0o755);
    const result = runImportHelper(fixture, csvPath);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /revoke the console-created intake key/i);
    assert.doesNotMatch(
      `${result.stdout}${result.stderr}`,
      fakeCredentialPattern,
    );
    assert.equal(existsSync(csvPath), true);
    assert.equal(readFileSync(fixture.envFile, "utf8"), before);
    assert.doesNotMatch(readFileSync(fixture.awsLog, "utf8"), /delete-access-key/);
  },
);

for (const [scenario, expectedError] of [
  ["wrong-region", /eu-central-1/i],
  ["wrong-stack-environment", /stack environment/i],
  ["wrong-user", /intake user/i],
]) {
  test(
    `the helper fails closed for ${scenario}`,
    { skip: !helperExists },
    () => {
      const fixture = makeFixture();
      const before = readFileSync(fixture.envFile, "utf8");
      const result = runHelper(fixture, "development", scenario);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expectedError);
      assert.equal(readFileSync(fixture.envFile, "utf8"), before);
      assert.doesNotMatch(readFileSync(fixture.awsLog, "utf8"), /create-access-key/);
    },
  );
}

test("the helper uses an atomic, non-verbose secret write path", { skip: !helperExists }, () => {
  assert.match(helper, /set \+x/);
  assert.match(helper, /umask 077/);
  assert.match(helper, /mktemp/);
  assert.match(helper, /chmod 600/);
  assert.match(helper, /mv/);
  assert.match(helper, /trap/);
  assert.doesNotMatch(helper, /set -x|tee|jq/);
});

test("asset capability signing uses its own required server-only secret", () => {
  assert.match(envExample, /^ASSET_CAPABILITY_HMAC_SECRET=$/m);
  assert.match(runtimeConfig, /process\.env\.ASSET_CAPABILITY_HMAC_SECRET/);
  assert.doesNotMatch(runtimeConfig, /process\.env\.ABUSE_HMAC_SECRET/);
  assert.match(runtimeConfig, /capabilitySecret\.length < 32/);
});
