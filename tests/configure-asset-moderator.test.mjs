import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const helperUrl = new URL("../ops/configure-asset-moderator.sh", import.meta.url);
const helperExists = existsSync(helperUrl);
const helper = helperExists ? readFileSync(helperUrl, "utf8") : "";

const fakeAccessKeyId = "AKIAIOSFODNN7EXAMPLE";
const fakeSecretAccessKey = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/+==";
const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fakeCredentialPattern = new RegExp(
  `${escapeRegex(fakeAccessKeyId)}|${escapeRegex(fakeSecretAccessKey)}`,
);

function makeFixture({ envSource = "UNCHANGED=value\n" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "bdag-asset-moderator-"));
  const ops = join(root, "ops");
  const bin = join(root, "bin");
  mkdirSync(ops);
  mkdirSync(bin);
  copyFileSync(helperUrl, join(ops, "configure-asset-moderator.sh"));
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
  *"sts get-caller-identity"*)
    [[ "$scenario" == "invalid-account" ]] && printf '%s\\n' invalid || printf '%s\\n' 123456789012
    ;;
  *"cloudformation describe-stacks"*"Stacks[0].StackStatus"*) printf '%s\\n' UPDATE_COMPLETE ;;
  *"cloudformation describe-stacks"*"ParameterKey=='Environment'"*)
    [[ "$scenario" == "wrong-stack-environment" ]] && printf '%s\\n' production || printf '%s\\n' development
    ;;
  *"cloudformation describe-stacks"*"AssetBucketName"*)
    [[ "$scenario" == "wrong-bucket" ]] && printf '%s\\n' bdag-community-assets-development-999999999999-eu-central-1 || printf '%s\\n' bdag-community-assets-development-123456789012-eu-central-1
    ;;
  *"cloudformation describe-stacks"*"ModeratorUserArn"*)
    [[ "$scenario" == "wrong-user" ]] && printf '%s\\n' arn:aws:iam::123456789012:user/bdag-community/other-user || printf '%s\\n' arn:aws:iam::123456789012:user/bdag-community/bdag-community-assets-development-moderator
    ;;
  *"iam get-user"*)
    if [[ "$scenario" == "wrong-user-record" ]]; then
      printf '%s\\n' $'arn:aws:iam::123456789012:user/bdag-community/bdag-community-assets-development-moderator\\t/other/\\tbdag-community-assets-development-moderator'
    else
      printf '%s\\n' $'arn:aws:iam::123456789012:user/bdag-community/bdag-community-assets-development-moderator\\t/bdag-community/\\tbdag-community-assets-development-moderator'
    fi
    ;;
  *"iam list-access-keys"*"length(AccessKeyMetadata[?Status=='Active'])"*)
    [[ "$scenario" == "inactive-key" ]] && printf '%s\\n' 0 || printf '%s\\n' 1
    ;;
  *"iam list-access-keys"*"Status=='Active'"*)
    [[ "$scenario" == "import-key-mismatch" ]] && printf '%s\\n' AKIAZZZZZZZZZZZZZZZZ || printf '%s\\n' ${fakeAccessKeyId}
    ;;
  *"iam list-access-keys"*)
    if [[ "\${FAKE_AWS_IMPORT_MODE:-}" == "1" ]]; then
      printf '%s\\n' 1
    elif [[ "$scenario" == "existing-key" ]]; then
      printf '%s\\n' 1
    elif [[ "$scenario" == "concurrent-key" && "$(grep -c 'length(AccessKeyMetadata)' "$FAKE_AWS_LOG")" -gt 1 ]]; then
      printf '%s\\n' 2
    elif [[ "$(grep -c 'length(AccessKeyMetadata)' "$FAKE_AWS_LOG")" -gt 1 ]]; then
      printf '%s\\n' 1
    else
      printf '%s\\n' 0
    fi
    ;;
  *"iam create-access-key"*)
    printf '%s\\n' '{"AccessKey":{"UserName":"bdag-community-assets-development-moderator","AccessKeyId":"${fakeAccessKeyId}","SecretAccessKey":"${fakeSecretAccessKey}"}}'
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
    [
      join(fixture.root, "ops/configure-asset-moderator.sh"),
      environment,
      "test-profile",
    ],
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
    source = `User name,Access key ID,Secret access key\nbdag-community-assets-development-moderator,${fakeAccessKeyId},${fakeSecretAccessKey}\n`,
    mode = 0o600,
    name = "development-moderator.csv",
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
      join(fixture.root, "ops/configure-asset-moderator.sh"),
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

test("the development-only asset moderator helper exists", () => {
  assert.equal(helperExists, true);
});

test(
  "CLI creation writes only moderator credentials and preserves unrelated env",
  { skip: !helperExists },
  () => {
    const original = [
      "# existing local settings",
      "UNCHANGED=value",
      "ASSET_S3_ACCESS_KEY_ID=intake-key-must-stay",
      "ASSET_S3_SECRET_ACCESS_KEY=intake-secret-must-stay",
      "ASSET_MODERATION_S3_ACCESS_KEY_ID=replace-me",
      "ASSET_MODERATION_S3_SECRET_ACCESS_KEY=replace-me-too",
      "",
    ].join("\n");
    const fixture = makeFixture({ envSource: original });
    const result = runHelper(fixture);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout,
      "Development asset moderator runtime configured securely.\n",
    );
    assert.equal(result.stderr, "");
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, fakeCredentialPattern);

    const env = readFileSync(fixture.envFile, "utf8");
    assert.match(env, /^# existing local settings$/m);
    assert.match(env, /^UNCHANGED=value$/m);
    assert.match(env, /^ASSET_S3_ACCESS_KEY_ID=intake-key-must-stay$/m);
    assert.match(
      env,
      /^ASSET_S3_SECRET_ACCESS_KEY=intake-secret-must-stay$/m,
    );
    assert.match(
      env,
      new RegExp(
        `^ASSET_MODERATION_S3_ACCESS_KEY_ID=${escapeRegex(fakeAccessKeyId)}$`,
        "m",
      ),
    );
    assert.match(
      env,
      new RegExp(
        `^ASSET_MODERATION_S3_SECRET_ACCESS_KEY=${escapeRegex(fakeSecretAccessKey)}$`,
        "m",
      ),
    );
    assert.equal(
      (env.match(/^ASSET_MODERATION_S3_ACCESS_KEY_ID=/gm) ?? []).length,
      1,
    );
    assert.equal(
      (env.match(/^ASSET_MODERATION_S3_SECRET_ACCESS_KEY=/gm) ?? []).length,
      1,
    );
    assert.equal(statSync(fixture.envFile).mode & 0o777, 0o600);

    const awsCalls = readFileSync(fixture.awsLog, "utf8");
    assert.equal((awsCalls.match(/iam create-access-key/g) ?? []).length, 1);
    assert.match(awsCalls, /ModeratorUserArn/);
    assert.match(awsCalls, /AssetBucketName/);
    assert.match(awsCalls, /length\(AccessKeyMetadata\[\?Status=='Active'\]\)/);
    assert.doesNotMatch(awsCalls, new RegExp(escapeRegex(fakeSecretAccessKey)));
  },
);

test(
  "production is rejected before AWS or local mutation",
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
  "CLI creation refuses a moderator user that already has a key",
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
  "CLI creation rolls back its new key when the atomic env write cannot start",
  { skip: !helperExists },
  () => {
    const fixture = makeFixture();
    const fakeMktemp = join(fixture.bin, "mktemp");
    writeFileSync(fakeMktemp, "#!/usr/bin/env bash\nexit 72\n");
    chmodSync(fakeMktemp, 0o755);
    const before = readFileSync(fixture.envFile, "utf8");
    const result = runHelper(fixture);

    assert.notEqual(result.status, 0);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, fakeCredentialPattern);
    assert.equal(readFileSync(fixture.envFile, "utf8"), before);
    const awsCalls = readFileSync(fixture.awsLog, "utf8");
    assert.equal((awsCalls.match(/iam create-access-key/g) ?? []).length, 1);
    assert.equal((awsCalls.match(/iam delete-access-key/g) ?? []).length, 1);
  },
);

test(
  "CLI creation rolls back its key if another key appears concurrently",
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
  "console CSV import validates the live key, writes env, and removes the CSV without disclosure",
  { skip: !helperExists },
  () => {
    const fixture = makeFixture({ envSource: "UNCHANGED=console-import\n" });
    const csvPath = writeCredentialCsv(fixture);
    const result = runImportHelper(fixture, csvPath);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout,
      "Development asset moderator runtime configured securely.\n",
    );
    assert.equal(result.stderr, "");
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, fakeCredentialPattern);
    assert.equal(existsSync(csvPath), false);
    const env = readFileSync(fixture.envFile, "utf8");
    assert.match(env, /^UNCHANGED=console-import$/m);
    assert.match(
      env,
      new RegExp(
        `^ASSET_MODERATION_S3_ACCESS_KEY_ID=${escapeRegex(fakeAccessKeyId)}$`,
        "m",
      ),
    );
    assert.match(
      env,
      new RegExp(
        `^ASSET_MODERATION_S3_SECRET_ACCESS_KEY=${escapeRegex(fakeSecretAccessKey)}$`,
        "m",
      ),
    );
    assert.equal(statSync(fixture.envFile).mode & 0o777, 0o600);
    const awsCalls = readFileSync(fixture.awsLog, "utf8");
    assert.doesNotMatch(awsCalls, /create-access-key|delete-access-key/);
  },
);

test(
  "console CSV import accepts the exact two-column AWS format",
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
    "multiple credential rows",
    `Access key ID,Secret access key\n${fakeAccessKeyId},${fakeSecretAccessKey}\n${fakeAccessKeyId},${fakeSecretAccessKey}\n`,
    /exactly one credential row/i,
  ],
  [
    "the wrong moderator username",
    `User name,Access key ID,Secret access key\nother-user,${fakeAccessKeyId},${fakeSecretAccessKey}\n`,
    /moderator username/i,
  ],
  [
    "an invalid key value",
    `Access key ID,Secret access key\nnot-a-key,${fakeSecretAccessKey}\n`,
    /credential values/i,
  ],
]) {
  test(
    `console CSV import rejects ${name} before AWS or env mutation`,
    { skip: !helperExists },
    () => {
      const fixture = makeFixture();
      const csvPath = writeCredentialCsv(fixture, { source });
      const before = readFileSync(fixture.envFile, "utf8");
      const result = runImportHelper(fixture, csvPath);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expectedError);
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, fakeCredentialPattern);
      assert.equal(existsSync(csvPath), true);
      assert.equal(readFileSync(fixture.envFile, "utf8"), before);
      assert.equal(existsSync(fixture.awsLog), false);
    },
  );
}

test(
  "console CSV import rejects relative, linked, and broad-permission files",
  { skip: !helperExists },
  () => {
    for (const kind of ["relative", "symlink", "world-readable"]) {
      const fixture = makeFixture();
      const secureCsv = writeCredentialCsv(fixture);
      let csvPath = secureCsv;
      if (kind === "relative") csvPath = "development-moderator.csv";
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

for (const [scenario, expectedError] of [
  ["wrong-region", /eu-central-1/i],
  ["invalid-account", /account identity/i],
  ["wrong-stack-environment", /stack environment/i],
  ["wrong-bucket", /asset bucket/i],
  ["wrong-user", /moderator user/i],
  ["wrong-user-record", /moderator user could not be validated/i],
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

for (const [scenario, expectedError] of [
  ["import-key-mismatch", /single active key does not match/i],
  ["inactive-key", /exactly one active access key/i],
]) {
  test(
    `console CSV import preserves local files for ${scenario}`,
    { skip: !helperExists },
    () => {
      const fixture = makeFixture();
      const csvPath = writeCredentialCsv(fixture);
      const before = readFileSync(fixture.envFile, "utf8");
      const result = runImportHelper(fixture, csvPath, scenario);

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expectedError);
      assert.equal(existsSync(csvPath), true);
      assert.equal(readFileSync(fixture.envFile, "utf8"), before);
      assert.doesNotMatch(readFileSync(fixture.awsLog, "utf8"), /delete-access-key/);
    },
  );
}

test(
  "console CSV import keeps the key and CSV when the local atomic write fails",
  { skip: !helperExists },
  () => {
    const fixture = makeFixture();
    const csvPath = writeCredentialCsv(fixture);
    const fakeMktemp = join(fixture.bin, "mktemp");
    writeFileSync(fakeMktemp, "#!/usr/bin/env bash\nexit 72\n");
    chmodSync(fakeMktemp, 0o755);
    const before = readFileSync(fixture.envFile, "utf8");
    const result = runImportHelper(fixture, csvPath);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /revoke the console-created moderator key/i);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, fakeCredentialPattern);
    assert.equal(existsSync(csvPath), true);
    assert.equal(readFileSync(fixture.envFile, "utf8"), before);
    assert.doesNotMatch(readFileSync(fixture.awsLog, "utf8"), /delete-access-key/);
  },
);

test(
  "the helper uses an atomic non-verbose write and safe CSV destruction path",
  { skip: !helperExists },
  () => {
    assert.match(helper, /set \+x/);
    assert.match(helper, /umask 077/);
    assert.match(helper, /mktemp/);
    assert.match(helper, /chmod 600/);
    assert.match(helper, /mv -f/);
    assert.match(helper, /trap cleanup EXIT/);
    assert.match(helper, /O_NOFOLLOW/);
    assert.match(helper, /ftruncateSync/);
    assert.match(helper, /fsyncSync/);
    assert.match(helper, /unlinkSync/);
    assert.doesNotMatch(helper, /set -x|tee|jq/);
  },
);

test(
  "the helper is scoped to moderator credentials and not intake or capability values",
  { skip: !helperExists },
  () => {
    assert.match(helper, /ASSET_MODERATION_S3_ACCESS_KEY_ID/);
    assert.match(helper, /ASSET_MODERATION_S3_SECRET_ACCESS_KEY/);
    assert.doesNotMatch(helper, /ASSET_S3_ACCESS_KEY_ID/);
    assert.doesNotMatch(helper, /ASSET_S3_SECRET_ACCESS_KEY/);
    assert.doesNotMatch(helper, /ASSET_CAPABILITY_HMAC_SECRET|ABUSE_HMAC_SECRET/);
  },
);

test(
  "the environment target must remain an ignored regular file",
  { skip: !helperExists },
  () => {
    const fixture = makeFixture();
    const realEnv = join(fixture.root, "real-env");
    writeFileSync(realEnv, "UNCHANGED=linked\n");
    execFileSync("rm", [fixture.envFile]);
    execFileSync("ln", ["-s", realEnv, fixture.envFile]);

    const result = runHelper(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /regular file, not a link/i);
    assert.equal(readFileSync(realEnv, "utf8"), "UNCHANGED=linked\n");
    assert.equal(existsSync(fixture.awsLog), false);
    assert.equal(lstatSync(fixture.envFile).isSymbolicLink(), true);
  },
);
