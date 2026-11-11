export const ARTICLE_BUTTON_MAX_LABEL_LENGTH = 120;
export const ARTICLE_BUTTON_MAX_URL_LENGTH = 2048;

export function isArticleButtonUrl(value: string): boolean {
  if (!value || value.length > ARTICLE_BUTTON_MAX_URL_LENGTH || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  if (/^(?:\/(?!\/)|#)/.test(value)) return true;
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return Boolean(url.hostname && !url.username && !url.password);
  } catch {
    return false;
  }
}

export function validateArticleButton(label: string, href: string) {
  const text = label.trim();
  const url = href.trim();
  if (!text || text.length > ARTICLE_BUTTON_MAX_LABEL_LENGTH) {
    return { ok: false as const, field: "label" as const };
  }
  if (!isArticleButtonUrl(url)) {
    return { ok: false as const, field: "href" as const };
  }
  return { ok: true as const, label: text, href: url };
}
