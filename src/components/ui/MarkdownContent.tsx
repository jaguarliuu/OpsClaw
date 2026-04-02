import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type MarkdownContentProps = {
  content: string;
  className?: string;
};

function hasReactChildrenProp(
  props: unknown
): props is {
  children?: ReactNode;
} {
  return typeof props === 'object' && props !== null && 'children' in props;
}

function extractTextContent(children: ReactNode): string {
  if (typeof children === 'string') {
    return children;
  }

  if (typeof children === 'number') {
    return String(children);
  }

  if (Array.isArray(children)) {
    return children.map((child: ReactNode) => extractTextContent(child)).join('');
  }

  if (React.isValidElement(children)) {
    const props: unknown = children.props;
    if (hasReactChildrenProp(props)) {
      return extractTextContent(props.children);
    }
  }

  return '';
}

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const code = extractTextContent(children).replace(/\n$/, '');

  const handleCopy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className="assistant-code-block group relative my-3 overflow-hidden rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="assistant-code-toolbar flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-400/80" />
          <span className="h-2 w-2 rounded-full bg-amber-300/80" />
          <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="assistant-code-copy inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="assistant-code-pre overflow-x-auto p-3 text-[12px] leading-6">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={className ? `assistant-markdown ${className}` : 'assistant-markdown'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => {
            const { node, ...rest } = props;
            void node;
            return (
              <a
                {...rest}
                target="_blank"
                rel="noreferrer"
                className="assistant-markdown-link underline underline-offset-2"
              />
            );
          },
          code: (props) => {
            const { node, className: codeClassName, children, ...rest } = props;
            void node;
            return codeClassName?.includes('language-') ? (
              <code {...rest} className={codeClassName}>
                {children}
              </code>
            ) : (
              <code
                {...rest}
                className={`assistant-inline-code rounded px-1 py-0.5 font-mono text-[0.92em] ${
                  codeClassName ?? ''
                }`.trim()}
              >
                {children}
              </code>
            );
          },
          pre: (props) => {
            const { node, children } = props;
            void node;
            return <CodeBlock>{children}</CodeBlock>;
          },
          table: (props) => {
            const { node, ...rest } = props;
            void node;
            return (
              <div className="assistant-table-wrap my-3 overflow-x-auto rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <table {...rest} className="min-w-full border-collapse text-left text-xs" />
              </div>
            );
          },
          th: (props) => {
            const { node, ...rest } = props;
            void node;
            return (
              <th
                {...rest}
                className="assistant-table-head border px-2 py-1 font-medium"
              />
            );
          },
          td: (props) => {
            const { node, ...rest } = props;
            void node;
            return (
              <td {...rest} className="assistant-table-cell border px-2 py-1 align-top" />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
