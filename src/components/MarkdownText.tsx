import ReactMarkdown from "react-markdown";
import { cn } from "../lib/utils";

/** Safe Markdown display: raw HTML is intentionally not enabled. */
export function MarkdownText({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("markdown-content", className)}>
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
