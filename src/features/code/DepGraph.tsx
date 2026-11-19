/**
 * Dependency graph in SVG, without a graph library. Around a file: importers on the left, the file
 * in the middle, its imports on the right (and a second ring when depth is 2). Without a focus:
 * folders on a circle. Capped by the agent at 150 nodes.
 */
import { useMemo } from "react";
import type { GraphData } from "@/lib/agent-client";
import { cn } from "@/lib/utils";

type Pos = { x: number; y: number };

export function DepGraph({
  graph,
  onOpen,
  highlight,
}: {
  graph: GraphData;
  onOpen?: (id: string, kind: string) => void;
  highlight?: Set<string>;
}) {
  const layout = useMemo(() => {
    const pos = new Map<string, Pos>();
    const W = 900;
    if (graph.focus) {
      const f = graph.focus;
      const left = new Set<string>();
      const right = new Set<string>();
      for (const e of graph.edges) {
        if (e.to === f) left.add(e.from);
        if (e.from === f) right.add(e.to);
      }
      const rest = graph.nodes
        .map((n) => n.id)
        .filter((id) => id !== f && !left.has(id) && !right.has(id));
      const cols: string[][] = [
        [
          ...rest.filter((id) =>
            graph.edges.some((e) => e.to !== f && left.has(e.to) && e.from === id),
          ),
        ],
        [...left],
        [f],
        [...right],
        rest.filter(
          (id) => !graph.edges.some((e) => e.to !== f && left.has(e.to) && e.from === id),
        ),
      ];
      const used = cols.filter((c) => c.length);
      const H = Math.max(240, Math.max(...used.map((c) => c.length)) * 34 + 40);
      used.forEach((col, ci) =>
        col.forEach((id, i) =>
          pos.set(id, {
            x: 80 + (ci * (W - 160)) / Math.max(1, used.length - 1),
            y: 30 + ((i + 0.5) * (H - 60)) / col.length,
          }),
        ),
      );
      return { pos, W, H };
    }
    const H = 560;
    const n = graph.nodes.length;
    graph.nodes
      .slice()
      .sort((a, b) => (b.fanIn ?? 0) - (a.fanIn ?? 0))
      .forEach((node, i) => {
        const a = (2 * Math.PI * i) / Math.max(1, n);
        pos.set(node.id, {
          x: W / 2 + Math.cos(a) * (W / 2 - 120),
          y: H / 2 + Math.sin(a) * (H / 2 - 50),
        });
      });
    return { pos, W, H };
  }, [graph]);

  if (!graph.nodes.length) return <p className="text-sm text-muted-foreground">Nothing to show.</p>;
  return (
    <div className="space-y-2">
      <div className="overflow-auto rounded-lg border border-border bg-background/40">
        <svg
          viewBox={`0 0 ${layout.W} ${layout.H}`}
          width="100%"
          style={{ minWidth: 640 }}
          role="img"
          aria-label={graph.focus ? `Dependencies of ${graph.focus}` : "Folder dependencies"}
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
            </marker>
          </defs>
          {graph.edges.map((e, i) => {
            const a = layout.pos.get(e.from);
            const b = layout.pos.get(e.to);
            if (!a || !b) return null;
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                markerEnd="url(#arrow)"
                className={cn(
                  "stroke-1",
                  e.kind === "tests" ? "stroke-diff-add/60" : "stroke-muted-foreground/40",
                  highlight && (highlight.has(e.from) || highlight.has(e.to)) && "stroke-primary",
                )}
                strokeDasharray={e.kind === "tests" ? "4 3" : undefined}
              />
            );
          })}
          {graph.nodes.map((n) => {
            const p = layout.pos.get(n.id);
            if (!p) return null;
            const focus = n.id === graph.focus;
            const hl = highlight?.has(n.id);
            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                className="cursor-pointer"
                onClick={() => onOpen?.(n.id, n.kind)}
                role="button"
                tabIndex={0}
                aria-label={n.id}
                onKeyDown={(e) => e.key === "Enter" && onOpen?.(n.id, n.kind)}
              >
                <title>{`${n.id}${n.fanIn ? ` · imported by ${n.fanIn}` : ""}${n.test ? " · test" : ""}`}</title>
                <circle
                  r={focus ? 9 : 6 + Math.min(6, Math.sqrt(n.fanIn ?? 0))}
                  className={cn(
                    focus
                      ? "fill-primary"
                      : hl
                        ? "fill-primary/70"
                        : n.test
                          ? "fill-diff-add/70"
                          : n.kind === "package"
                            ? "fill-agent"
                            : "fill-muted-foreground/70",
                  )}
                />
                <text
                  x={12}
                  y={4}
                  className={cn("fill-foreground text-[11px]", focus && "font-semibold")}
                >
                  {n.label.length > 34 ? `${n.label.slice(0, 33)}…` : n.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-xs text-muted-foreground">
        {graph.nodes.length} nodes · {graph.edges.length} edges
        {graph.truncated ? " · limited to keep it readable" : ""}.{" "}
        {graph.focus
          ? "Left: files that import it. Right: what it imports. Dashed: tests."
          : "Folders by import links; size shows how often they're imported."}{" "}
        Click a node to focus it.
      </p>
    </div>
  );
}
