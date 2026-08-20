import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownPreview({ content }: { content: string }) {
  return <article className="file-markdown-preview">
    <Markdown remarkPlugins={[remarkGfm]} components={{
      img: ({ alt }) => <span className="markdown-blocked-image">[图片已禁用：{alt ?? "无描述"}]</span>,
    }}>{content}</Markdown>
  </article>;
}
