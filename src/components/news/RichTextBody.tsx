import {
  plainTextToArticleHtml,
  sanitizeArticleBody,
} from "@/lib/news/rich-text";

export function RichTextBody({
  html,
  plainText,
}: {
  html: string | null;
  plainText: string;
}) {
  const source = html ?? plainTextToArticleHtml(plainText);
  const safeBody = sanitizeArticleBody(source);

  return (
    <div
      className="rich-text-body max-w-[68ch]"
      dangerouslySetInnerHTML={{ __html: safeBody.html }}
    />
  );
}
