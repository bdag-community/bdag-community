"use client";

import {
  Bold,
  SquareArrowOutUpRight,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useRef, useState } from "react";
import { RICH_TEXT_COPY } from "@/lib/content/site";
import { ArticleButton } from "@/components/news/ArticleButton";
import { ARTICLE_BUTTON_MAX_LABEL_LENGTH, ARTICLE_BUTTON_MAX_URL_LENGTH, validateArticleButton } from "@/lib/news/article-button";

type RichTextEditorProps = {
  id: string;
  name?: string;
  initialValue?: string;
  fallbackValue?: string;
  label: string;
  labelClassName?: string;
  describedBy?: string;
  invalid?: boolean;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  onChange?: (html: string) => void;
};

type ToolbarButtonProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  index: number;
  toolbarIndex: number;
  onToolbarFocus: (index: number) => void;
  onClick: () => void;
  children: React.ReactNode;
};

const toolbarButton =
  "focus-ring inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-transparent px-2.5 text-on-surface-variant transition-colors hover:border-border hover:bg-elevated hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-40";

function isAllowedEditorLink(url: string): boolean {
  if (/^(?:\/(?!\/)|#)/.test(url)) return true;
  if (!/^(?:https?:\/\/|mailto:)/i.test(url)) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      (parsed.protocol === "mailto:" && parsed.pathname.length > 0)
    );
  } catch {
    return false;
  }
}

function ToolbarButton({
  label,
  active,
  disabled,
  index,
  toolbarIndex,
  onToolbarFocus,
  onClick,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      data-toolbar-index={index}
      tabIndex={index === toolbarIndex ? 0 : -1}
      onFocus={() => onToolbarFocus(index)}
      onClick={onClick}
      className={
        active
          ? toolbarButton +
            " border-accent/50 bg-accent/15 text-accent-soft"
          : toolbarButton
      }
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  id,
  name,
  initialValue = "",
  fallbackValue,
  label,
  labelClassName = "text-sm font-medium text-on-surface",
  describedBy,
  invalid,
  required,
  minLength,
  maxLength,
  onChange,
}: RichTextEditorProps) {
  const labelId = id + "-editor-label";
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarIndex, setToolbarIndex] = useState(0);
  const [editorHtml, setEditorHtml] = useState(initialValue);
  const [buttonPanel, setButtonPanel] = useState(false);
  const [buttonLabel, setButtonLabel] = useState("");
  const [buttonHref, setButtonHref] = useState("");
  const [buttonError, setButtonError] = useState<"label" | "href" | null>(null);
  const buttonLabelRef = useRef<HTMLInputElement>(null);
  const buttonHrefRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions: [
      ArticleButton,
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        strike: false,
        horizontalRule: false,
        link: {
          autolink: true,
          linkOnPaste: true,
          openOnClick: false,
          defaultProtocol: "https",
          protocols: ["http", "https", "mailto"],
          HTMLAttributes: {},
          isAllowedUri: (url, ctx) =>
            ctx.defaultValidate(url) &&
            isAllowedEditorLink(url),
        },
      }),
    ],
    content: initialValue,
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(invalid ? { "aria-invalid": "true" } : {}),
        ...(required ? { "aria-required": "true" } : {}),
        class: "rich-text-editor min-h-[21rem] px-4 py-3 focus:outline-none",
      },
      handleKeyDown: (_view, event) => {
        if (event.altKey && event.key === "F10") {
          const target = toolbarRef.current?.querySelector<HTMLButtonElement>(
            'button:not(:disabled)[tabindex="0"]',
          );
          target?.focus();
          event.preventDefault();
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        click: (_view, event) => {
          // ProseMirror selects the atom on pointer-down. Cancel the later
          // native click too, so selecting a button never opens an unsaved link.
          if (event.target instanceof Element && event.target.closest('a[data-article-button="true"]')) {
            event.preventDefault();
            return true;
          }
          return false;
        },
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      const html = activeEditor.isEmpty ? "" : activeEditor.getHTML();
      setEditorHtml(html);
      onChange?.(html);
    },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: activeEditor }) => ({
      bold: activeEditor?.isActive("bold") ?? false,
      italic: activeEditor?.isActive("italic") ?? false,
      underline: activeEditor?.isActive("underline") ?? false,
      heading2: activeEditor?.isActive("heading", { level: 2 }) ?? false,
      heading3: activeEditor?.isActive("heading", { level: 3 }) ?? false,
      bulletList: activeEditor?.isActive("bulletList") ?? false,
      orderedList: activeEditor?.isActive("orderedList") ?? false,
      blockquote: activeEditor?.isActive("blockquote") ?? false,
      link: activeEditor?.isActive("link") ?? false,
      articleButton: activeEditor?.isActive("articleButton") ?? false,
      canUndo: activeEditor?.can().undo() ?? false,
      canRedo: activeEditor?.can().redo() ?? false,
    }),
  });
  const enhanced = Boolean(editor);
  const effectiveToolbarIndex =
    (toolbarIndex === 9 && !state?.canUndo) ||
    (toolbarIndex === 10 && !state?.canRedo)
      ? 0
      : toolbarIndex;
  const toolbarProps = (index: number) => ({
    index,
    toolbarIndex: effectiveToolbarIndex,
    onToolbarFocus: setToolbarIndex,
  });

  function editLink() {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt(RICH_TEXT_COPY.linkPrompt, previous ?? "https://");
    if (!href) return;
    if (!isAllowedEditorLink(href)) {
      window.alert(RICH_TEXT_COPY.linkInvalid);
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }

  function editButton() {
    if (!editor) return;
    const attrs = editor.getAttributes("articleButton");
    setButtonLabel(typeof attrs.label === "string" ? attrs.label : editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to));
    setButtonHref(typeof attrs.href === "string" ? attrs.href : "");
    setButtonError(null);
    setButtonPanel(true);
    requestAnimationFrame(() => buttonLabelRef.current?.focus());
  }

  function saveButton() {
    if (!editor) return;
    const result = validateArticleButton(buttonLabel, buttonHref);
    if (!result.ok) {
      setButtonError(result.field);
      (result.field === "label" ? buttonLabelRef : buttonHrefRef).current?.focus();
      return;
    }
    const attrs = { label: result.label, href: result.href };
    if (editor.isActive("articleButton")) {
      editor.chain().focus().updateAttributes("articleButton", attrs).run();
    } else {
      editor.chain().focus().insertContent([
        { type: "articleButton", attrs },
        { type: "paragraph" },
      ]).run();
    }
    setButtonPanel(false);
  }

  function moveToolbarFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled)',
      ),
    );
    const current = controls.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0 || controls.length === 0) return;
    event.preventDefault();
    const target =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? controls.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + controls.length) %
            controls.length;
    const targetControl = controls[target];
    if (!targetControl) return;
    setToolbarIndex(Number(targetControl.dataset.toolbarIndex ?? 0));
    targetControl.focus();
  }

  return (
    <>
      <label
        id={labelId}
        htmlFor={id}
        className={labelClassName}
        onClick={(event) => {
          if (!editor) return;
          event.preventDefault();
          editor.commands.focus();
        }}
      >
        {label}
      </label>
      <div className="overflow-hidden rounded-xl border border-border bg-container/70 focus-within:border-accent/70">
        {enhanced && editor ? (
          <>
            <div
              ref={toolbarRef}
              role="toolbar"
              aria-label={label + RICH_TEXT_COPY.toolbarSuffix}
              onKeyDown={moveToolbarFocus}
              className="flex flex-wrap gap-0.5 border-b border-border/70 bg-base-void/45 p-1.5"
            >
            <ToolbarButton
              {...toolbarProps(0)}
              label={RICH_TEXT_COPY.heading2}
              active={state?.heading2}
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 2 }).run()
              }
            >
              <Heading2 className="size-4" aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              {...toolbarProps(1)}
              label={RICH_TEXT_COPY.heading3}
              active={state?.heading3}
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 3 }).run()
              }
            >
              <Heading3 className="size-4" aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              {...toolbarProps(2)}
              label={RICH_TEXT_COPY.bold}
              active={state?.bold}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold className="size-4" aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              {...toolbarProps(3)}
              label={RICH_TEXT_COPY.italic}
              active={state?.italic}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic className="size-4" aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              {...toolbarProps(4)}
              label={RICH_TEXT_COPY.underline}
              active={state?.underline}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <Underline className="size-4" aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              {...toolbarProps(5)}
              label={RICH_TEXT_COPY.bulletList}
              active={state?.bulletList}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List className="size-4" aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              {...toolbarProps(6)}
              label={RICH_TEXT_COPY.orderedList}
              active={state?.orderedList}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered className="size-4" aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              {...toolbarProps(7)}
              label={RICH_TEXT_COPY.quotation}
              active={state?.blockquote}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            >
              <Quote className="size-4" aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              {...toolbarProps(8)}
              label={RICH_TEXT_COPY.link}
              active={state?.link}
              onClick={editLink}
            >
              <Link2 className="size-4" aria-hidden />
            </ToolbarButton>
            <span className="mx-1 my-2 w-px bg-border" aria-hidden />
            <ToolbarButton
              {...toolbarProps(9)}
              label={RICH_TEXT_COPY.undo}
              disabled={!state?.canUndo}
              onClick={() => editor.chain().focus().undo().run()}
            >
              <Undo2 className="size-4" aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              {...toolbarProps(10)}
              label={RICH_TEXT_COPY.redo}
              disabled={!state?.canRedo}
              onClick={() => editor.chain().focus().redo().run()}
            >
              <Redo2 className="size-4" aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              {...toolbarProps(11)}
              label={RICH_TEXT_COPY.button}
              active={state?.articleButton}
              onClick={editButton}
            >
              <SquareArrowOutUpRight className="size-4" aria-hidden />
            </ToolbarButton>
            </div>
            {buttonPanel ? (
              <div
                role="group"
                aria-label={RICH_TEXT_COPY.button}
                className="space-y-3 border-b border-border bg-base-void/60 p-4"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setButtonPanel(false);
                    editor.commands.focus();
                  }
                  if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
                    event.preventDefault();
                    saveButton();
                  }
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor={`${id}-button-text`} className="block text-sm font-medium">{RICH_TEXT_COPY.buttonText}</label>
                    <input ref={buttonLabelRef} id={`${id}-button-text`} value={buttonLabel} onChange={(event) => setButtonLabel(event.target.value)} maxLength={ARTICLE_BUTTON_MAX_LABEL_LENGTH} aria-invalid={buttonError === "label" || undefined} aria-describedby={buttonError === "label" ? `${id}-button-error` : `${id}-button-help`} className="focus-ring min-h-[44px] w-full rounded-lg border border-border bg-container px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={`${id}-button-url`} className="block text-sm font-medium">{RICH_TEXT_COPY.buttonUrl}</label>
                    <input ref={buttonHrefRef} id={`${id}-button-url`} value={buttonHref} onChange={(event) => setButtonHref(event.target.value)} maxLength={ARTICLE_BUTTON_MAX_URL_LENGTH} autoCapitalize="none" spellCheck={false} aria-invalid={buttonError === "href" || undefined} aria-describedby={buttonError === "href" ? `${id}-button-error` : `${id}-button-help`} className="focus-ring min-h-[44px] w-full rounded-lg border border-border bg-container px-3 py-2 text-sm" />
                  </div>
                </div>
                <p id={`${id}-button-help`} className="text-xs leading-relaxed text-on-surface-variant">{RICH_TEXT_COPY.buttonHelp}</p>
                {buttonError ? <p id={`${id}-button-error`} role="alert" className="text-sm text-error">{buttonError === "label" ? RICH_TEXT_COPY.buttonTextInvalid : RICH_TEXT_COPY.buttonUrlInvalid}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={saveButton} className="btn-primary focus-ring min-h-[44px] rounded-full px-4 py-2 text-sm font-semibold">{state?.articleButton ? RICH_TEXT_COPY.updateButton : RICH_TEXT_COPY.insertButton}</button>
                  {state?.articleButton ? <button type="button" className="btn-ghost focus-ring min-h-[44px] rounded-full px-4 py-2 text-sm" onClick={() => { editor.chain().focus().deleteSelection().run(); setButtonPanel(false); }}>{RICH_TEXT_COPY.removeButton}</button> : null}
                  <button type="button" className="focus-ring min-h-[44px] rounded-full px-4 py-2 text-sm" onClick={() => { setButtonPanel(false); editor.commands.focus(); }}>{RICH_TEXT_COPY.cancelButton}</button>
                </div>
              </div>
            ) : null}
            <EditorContent editor={editor} />
            {name ? (
              <input
                type="hidden"
                name={name}
                value={editorHtml}
                readOnly
              />
            ) : null}
          </>
        ) : (
          <textarea
            id={id}
            name={name}
            aria-labelledby={labelId}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            required={required}
            minLength={minLength}
            maxLength={maxLength}
            rows={14}
            defaultValue={fallbackValue ?? initialValue}
            className="min-h-[21rem] w-full resize-y bg-transparent px-4 py-3 text-sm leading-relaxed text-on-surface outline-none"
          />
        )}
        {name ? (
          <input
            type="hidden"
            name="bodyMode"
            value={enhanced ? "html" : "plain"}
          />
        ) : null}
        <span className="sr-only" aria-live="polite">
          {enhanced ? label + RICH_TEXT_COPY.readySuffix : ""}
        </span>
      </div>
    </>
  );
}
