import { memo, useEffect, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "@/lib/agent-client";
import { cn } from "@/lib/utils";

// Shiki is large: load it only when a code block first renders.
let highlighterPromise: Promise<import("shiki").Highlighter> | null = null;
function getHighlighter() {
  highlighterPromise ??= import("shiki").then(({ createHighlighter }) =>
    createHighlighter({
      themes: ["github-dark-dimmed", "github-light"],
      langs: ["ts", "tsx", "js", "jsx", "json", "bash", "python", "rust", "go", "css", "html", "sql", "yaml", "md", "diff"],
    }),
  );
  return highlighterPromise;
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    getHighlighter()
      .then((h) => {
        const language = h.getLoadedLanguages().includes(lang) ? lang : "text";
        const dark = document.documentElement.classList.contains("dark");
        const out = h.codeToHtml(code, { lang: language, theme: dark ? "github-dark-dimmed" : "github-light" });
        if (alive) setHtml(out);
      })
      .catch(() => {
        // Plain text fallback stays.
      });
    return () => {
      alive = false;
    };
  }, [code, lang]);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group my-3 overflow-hidden rounded-lg border border-border bg-secondary/60">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-mono">{lang || "text"}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-7 items-center gap-1 rounded px-1.5 hover:bg-accent hover:text-foreground"
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {html ? (
        <div
          className="overflow-x-auto p-3 text-[13px] leading-relaxed [&_pre]:!bg-transparent"
          // Shiki escapes the code it highlights; the input is model text, never raw HTML.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

const SAFE_URL = /^(https?:|mailto:)/i;

const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-([\w+-]+)/.exec(className ?? "");
    const text = String(children ?? "");
    const isBlock = match || text.includes("\n");
    if (!isBlock) {
      return (
        <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.9em]" {...props}>
          {children}
        </code>
      );
    }
    return <CodeBlock code={text.replace(/\n$/, "")} lang={match?.[1] ?? ""} />;
  },
  pre: ({ children }) => <>{children}</>,
  a({ href, children }) {
    const safe = href && SAFE_URL.test(href) ? href : undefined;
    return (
      <a
        href={safe}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2"
        onClick={(e) => {
          // In the desktop app, open links in the default browser.
          if (safe && isTauri()) {
            e.preventDefault();
            void openUrl(safe);
          }
        }}
      >
        {children}
      </a>
    );
  },
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-border px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
};

export const Markdown = memo(function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        "prose-vard text-[15px] leading-7 [&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-xl [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-base [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_hr]:my-4 [&_hr]:border-border",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
