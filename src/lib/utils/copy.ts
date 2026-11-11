/**
 * Put text on the clipboard, and actually succeed.
 *
 * WHY THIS EXISTS. Both copy controls on this site called
 * `navigator.clipboard.writeText` and swallowed every failure in a bare
 * `catch {}` — with the success state set AFTER the await. So whenever that
 * promise rejected, the button did nothing at all: no copy, no error, no
 * change of icon. It looked broken because, from the reader's side, it was.
 *
 * `writeText` rejects or is missing more often than it looks:
 *   - the page is not a secure context (any plain-HTTP origin that is not
 *     localhost — a LAN IP, a machine name, a preview host), where
 *     `navigator.clipboard` is simply `undefined`;
 *   - the document is not focused, which is a real condition on a click that
 *     arrives from a devtools panel, an extension, or an embedded frame;
 *   - a Permissions-Policy on an embedding page has switched clipboard-write
 *     off.
 *
 * None of those are the reader's fault and all of them have the same fix: fall
 * back to the legacy selection-based copy, which needs neither a secure
 * context nor focus. On this site the copyable values are RPC endpoints and a
 * chain ID — the strings someone has to get exactly right or lose money to the
 * fork — so "the button quietly did nothing" is not an acceptable failure.
 *
 * Returns whether the text actually made it. Callers are expected to use that:
 * claiming success we did not have is what this module exists to stop.
 */
export async function copyText(value: string): Promise<boolean> {
  if (!value) return false;

  // The modern path, when it is both present AND willing.
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through — a rejection here is exactly the case this exists for.
    }
  }

  return legacyCopy(value);
}

/**
 * The pre-Clipboard-API copy: select text in an off-screen field and let the
 * document copy command take it. Works without a secure context and without
 * focus, which is precisely where the modern API gives up.
 */
function legacyCopy(value: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;

  const field = document.createElement("textarea");
  field.value = value;
  // readOnly keeps the on-screen keyboard shut on mobile; a 1px fixed box with
  // no opacity keeps the page from scrolling to it or flashing it.
  field.readOnly = true;
  field.setAttribute("aria-hidden", "true");
  field.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:none;outline:none;box-shadow:none;background:transparent;opacity:0;";
  document.body.appendChild(field);

  // Copying must not silently destroy whatever the reader had selected.
  const selection = document.getSelection();
  const previous =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  try {
    field.select();
    field.setSelectionRange(0, value.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    if (selection && previous) {
      selection.removeAllRanges();
      selection.addRange(previous);
    }
  }
}

/**
 * Select an element's text on the page.
 *
 * The last resort, for when both copy paths fail: the value is on screen and
 * selectable by design, so hand the reader a selection they can take with the
 * keyboard rather than leaving them with a button that did nothing.
 */
export function selectElementText(node: Node | null): void {
  if (!node || typeof window === "undefined") return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}
