import { useMemo } from "react";
import type { GraphNode } from "../../lib/graph";
import { highlightCode } from "../../lib/highlight";

/** Syntax-highlighted snippet with real file line numbers in a gutter. */
export default function CodeBlock({ node }: { node: GraphNode }) {
  const html = useMemo(() => highlightCode(node.snippet, node.file), [node.snippet, node.file]);
  const count = node.snippet.split("\n").length;
  const gutter = Array.from({ length: count }, (_, i) => node.line + i).join("\n");

  return (
    <div className="flex max-h-72 overflow-auto rounded border border-slate-200 bg-white font-mono text-[11px] leading-5">
      <pre aria-hidden="true" className="sticky left-0 select-none border-r border-slate-200 bg-slate-50 px-2 text-right text-slate-400">
        {gutter}
      </pre>
      <pre className="px-3">
        <code className="xray-code" dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}
