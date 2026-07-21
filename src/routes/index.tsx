import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Mic, ChevronDown, Monitor, Search } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="flex min-h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col items-center justify-center relative px-4">
        <div className="w-full max-w-3xl flex flex-col items-center">
          <div className="w-full text-center md:text-left md:w-full md:px-8 mb-4">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
              What do you want to build?
            </h1>
          </div>

          <div className="w-full bg-card border border-border rounded-2xl p-4 flex flex-col shadow-lg focus-within:border-muted-foreground/50 focus-within:ring-1 focus-within:ring-muted-foreground/30 transition-all relative">
            <textarea
              className="w-full bg-transparent text-lg text-foreground placeholder-muted-foreground resize-none outline-none min-h-[100px] py-2"
              placeholder="Ask anything..."
            />

            <div className="flex items-center justify-between mt-2 pt-2">
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium transition-colors">
                  <Plus className="w-4 h-4" />
                  <span>Attach</span>
                </button>
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-secondary text-secondary-foreground text-sm font-medium transition-colors">
                  <Monitor className="w-4 h-4" />
                  <span>Project</span>
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-secondary text-secondary-foreground text-sm font-medium transition-colors">
                  <span>Model</span>
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  aria-label="Voice input"
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary text-secondary-foreground transition-colors"
                >
                  <Mic className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <Link
              to="/dashboard/chat"
              className="flex flex-col p-4 rounded-xl bg-gradient-to-br from-[#124d4e] to-[#0c3132] border border-[#1b6364] hover:brightness-110 transition-all text-left"
            >
              <div className="flex items-center gap-2 mb-2">
                <Search className="w-4 h-4 text-[#4fe1db]" />
                <span className="font-semibold text-white text-sm">Generate Code</span>
              </div>
              <p className="text-[#84c0bf] text-xs leading-relaxed">
                Get fast and accurate implementations from the most trusted AI models.
              </p>
            </Link>

            <Link
              to="/dashboard"
              className="flex flex-col p-4 rounded-xl bg-card border border-border hover:bg-secondary/50 transition-all text-left relative overflow-hidden"
            >
              <div className="flex items-center gap-2 mb-2">
                <Monitor className="w-4 h-4 text-muted-foreground" />
                <span className="font-semibold text-foreground text-sm">Manage Workspace</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-secondary text-primary ml-auto uppercase tracking-wider">
                  New
                </span>
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Hand over your projects to get polished, reliable deliverables around the clock.
              </p>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
