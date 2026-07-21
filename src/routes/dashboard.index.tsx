import { createFileRoute, Link } from "@tanstack/react-router";
import { Code2, PenLine, FileCode2 } from "lucide-react";
import { ChatPrompt } from "@/components/chat/ChatPrompt";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardHome,
});

const SUGGESTIONS = [
  { title: "Generate a React component", icon: Code2, q: "Generate a React component" },
  { title: "Write a project README", icon: PenLine, q: "Write a project README" },
  { title: "Scaffold a new Next.js app", icon: FileCode2, q: "Scaffold a new Next.js app" },
];

function DashboardHome() {
  const firstName = "there";

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-2rem)] w-full max-w-3xl mx-auto text-center px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-medium tracking-tight text-foreground mb-2">
          Good day, {firstName}
        </h1>
        <p className="text-xl text-muted-foreground font-light">How can I help you today?</p>
      </div>

      <ChatPrompt />

      <div className="flex flex-wrap items-center justify-center gap-3 w-full">
        {SUGGESTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.title}
              to="/dashboard/chat"
              search={{ q: s.q } as never}
              className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-xl text-sm text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-muted-foreground/50 transition-all cursor-pointer"
            >
              <Icon size={16} />
              {s.title}
            </Link>
          );
        })}
      </div>
    </div>
  );
}