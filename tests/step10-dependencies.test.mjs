import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const packageLock = JSON.parse(
  readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
);

test("Step 10 owns patched framework and image-processing dependencies", () => {
  assert.equal(packageJson.dependencies.next, "16.4.6");
  assert.equal(packageJson.devDependencies["eslint-config-next"], "16.4.6");
  assert.equal(packageJson.dependencies.sharp, "0.35.3");
  assert.equal(packageLock.packages["node_modules/next"].version, "16.4.6");
  assert.equal(
    packageLock.packages["node_modules/eslint-config-next"].version,
    "16.4.6",
  );
  assert.equal(packageLock.packages["node_modules/sharp"].version, "0.35.3");
});
