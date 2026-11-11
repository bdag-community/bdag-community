import { Node } from "@tiptap/react";
import { isArticleButtonUrl } from "@/lib/news/article-button";

/** A selectable block, not a live navigation link inside the editor. */
export const ArticleButton = Node.create({
  name: "articleButton",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      href: { default: "" },
      label: { default: "" },
    };
  },
  parseHTML() {
    return [{
      tag: 'a[data-article-button="true"]',
      priority: 100,
      getAttrs: (element) => {
        const href = element.getAttribute("href") ?? "";
        return isArticleButtonUrl(href)
          ? { href, label: element.textContent ?? "" }
          : false;
      },
    }];
  },
  renderHTML({ node }) {
    return ["a", {
      "data-article-button": "true",
      href: isArticleButtonUrl(node.attrs.href) ? node.attrs.href : undefined,
      target: "_blank",
      rel: "noopener noreferrer",
    }, node.attrs.label];
  },
});
