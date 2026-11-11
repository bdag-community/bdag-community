import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/components/admin/ConfirmDeleteButton.tsx", import.meta.url),
  "utf8",
);

test("delete confirmation hands focus across each swapped button subtree", () => {
  assert.match(source, /const triggerRef = useRef<HTMLButtonElement>\(null\)/);
  assert.match(source, /const confirmRef = useRef<HTMLButtonElement>\(null\)/);
  assert.match(source, /ref=\{triggerRef\}/);
  assert.match(source, /ref=\{confirmRef\}/);

  assert.match(
    source,
    /useEffect\(\(\) => \{[\s\S]*?if \(armed\) \{[\s\S]*?confirmRef\.current\?\.focus\(\)[\s\S]*?return[\s\S]*?\}[\s\S]*?if \(restoreTriggerFocusRef\.current\) \{[\s\S]*?triggerRef\.current\?\.focus\(\)[\s\S]*?restoreTriggerFocusRef\.current = false[\s\S]*?\}[\s\S]*?\}, \[armed\]\)/,
    "arming should focus the newly mounted confirm action, while cancellation should restore the newly mounted delete trigger",
  );

  assert.match(
    source,
    /function onCancel\(\) \{\s*restoreTriggerFocusRef\.current = true;\s*setArmed\(false\);\s*\}/,
    "the return-focus intent must be recorded before the confirmation subtree unmounts",
  );
});
