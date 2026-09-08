import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { isExternalHttpUrl, openExternalHttpUrl } from "../lib/externalUrl";

export function MarkdownPreview({ content }: { content: string }) {
  return <article className="file-markdown-preview">
    <Markdown remarkPlugins={[remarkGfm]} components={{
      a: ({ children, href, title }) => isExternalHttpUrl(href)
        ? <a href={href} title={title} target="_blank" rel="noreferrer" onClick={(event) => {
          event.preventDefault();
          void openExternalHttpUrl(href).catch(() => undefined);
        }}>{children}</a>
        : <span className="markdown-disabled-link" title={href}>{children}</span>,
      img: ({ alt }) => <span className="markdown-blocked-image">[图片已禁用：{alt ?? "无描述"}]</span>,
    }}>{content}</Markdown>
  </article>;
}
