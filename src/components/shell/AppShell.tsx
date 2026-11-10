import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { FolderGit2, LogOut, MessagesSquare, PanelLeft, Settings } from "lucide-react";

import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { cn } from "@/lib/utils";

type RailItem = { to: "/chat" | "/projects" | "/settings"; label: string; icon: ComponentType<{ className?: string }> };

const RAIL: RailItem[] = [
  { to: "/chat", label: "Chats", icon: MessagesSquare },
  { to: "/projects", label: "Projects", icon: FolderGit2 },
];

/**
 * Three columns: icon rail · list pane (chats or projects) · main view.
 * The window uses macOS's overlay title bar, so the top strip is a drag region.
 */
export function AppShell({ list }: { list?: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [listOpen, setListOpen] = useState(true);

  // ⌘N new chat · ⌘\ toggle the list pane
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      if (e.key === "n") {
        e.preventDefault();
        void navigate({ to: "/chat" });
      } else if (e.key === "\\") {
        e.preventDefault();
        setListOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Icon rail */}
      <nav
        aria-label="Sections"
        className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-border bg-sidebar pb-3"
        style={{ paddingTop: "calc(var(--titlebar-h) + 12px)" }}
        data-tauri-drag-region
      >
        <img src="/icon.svg" alt="" className="mb-3 size-8 rounded-lg" />
        {RAIL.map((item) => (
          <RailLink key={item.to} item={item} active={isActive(item.to)} />
        ))}
        <div className="flex-1" data-tauri-drag-region />
        <button
          type="button"
          onClick={() => setListOpen((v) => !v)}
          className="inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={listOpen ? "Hide sidebar" : "Show sidebar"}
          aria-pressed={listOpen}
          title="Toggle sidebar (⌘\)"
        >
          <PanelLeft className="size-5" />
        </button>
        <RailLink item={{ to: "/settings", label: "Settings", icon: Settings }} active={isActive("/settings")} />
        <button
          type="button"
          onClick={async () => {
            await signOut(auth);
            void navigate({ to: "/login" });
          }}
          className="inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="size-5" />
        </button>
      </nav>

      {/* List pane */}
      {list && listOpen && (
        <aside
          className="w-64 shrink-0 border-r border-border bg-sidebar/60"
          style={{ paddingTop: "var(--titlebar-h)" }}
        >
          {list}
        </aside>
      )}

      {/* Main */}
      <main className="relative min-w-0 flex-1" style={{ paddingTop: "var(--titlebar-h)" }}>
        <div className="absolute inset-x-0 top-0 z-10" style={{ height: "var(--titlebar-h)" }} data-tauri-drag-region />
        <Outlet />
      </main>
    </div>
  );
}

function RailLink({ item, active }: { item: RailItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-label={item.label}
      title={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex size-11 items-center justify-center rounded-lg transition-colors",
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {active && <span className="absolute top-2 bottom-2 -left-2.5 w-0.5 rounded-full bg-primary" aria-hidden />}
      <Icon className="size-5" />
    </Link>
  );
}
