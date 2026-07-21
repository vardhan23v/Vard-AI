import { Bot, Puzzle, Workflow } from "lucide-react";

export function VisualBuilder() {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
          <Bot className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Visual Agent Builder</h1>
          <p className="text-sm text-muted-foreground">
            Compose agents from tools, prompts, and workflows.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-xl border border-border bg-card">
          <Puzzle className="w-5 h-5 text-primary mb-3" />
          <h3 className="text-foreground font-medium mb-1">Tools</h3>
          <p className="text-sm text-muted-foreground">
            Drag in tools like search, code execution, and integrations.
          </p>
        </div>
        <div className="p-5 rounded-xl border border-border bg-card">
          <Workflow className="w-5 h-5 text-primary mb-3" />
          <h3 className="text-foreground font-medium mb-1">Workflows</h3>
          <p className="text-sm text-muted-foreground">
            Chain steps together to build multi-step agents.
          </p>
        </div>
      </div>
      <div className="mt-8 p-8 rounded-xl border border-dashed border-border bg-card/40 text-center text-sm text-muted-foreground">
        Builder canvas coming soon.
      </div>
    </div>
  );
}