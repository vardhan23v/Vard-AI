import { Link, useRouterState } from "@tanstack/react-router";
import {
  Search,
  Sparkles,
  FolderClosed,
  Library,
  Settings,
  SquareUserRound,
  Bot,
  Brain,
  Zap,
  Plug,
  History,
  BarChart3,
  FileText,
  Mic,
  Command,
} from "lucide-react";
import type { ComponentType } from "react";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { useBrand } from "@/lib/brand";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
};

const mainNav: NavItem[] = [
  { to: "/", label: "Home", icon: Search, exact: true },
  { to: "/dashboard", label: "Workspace", icon: FolderClosed },
  { to: "/dashboard/agents", label: "Agents", icon: Bot },
  { to: "/library", label: "Library", icon: Library },
  { to: "/memory", label: "Memory", icon: Brain },
  { to: "/automations", label: "Automations", icon: Zap },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/personality", label: "Personality", icon: Sparkles },
  { to: "/history", label: "History", icon: History },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/voice", label: "Voice & Avatar", icon: Mic },
  { to: "/shortcuts", label: "Shortcuts", icon: Command },
];

const bottomNav: NavItem[] = [
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { name, logo } = useBrand();

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/");

  return (
    <aside className="hidden sm:flex w-16 md:w-64 border-r border-border bg-sidebar flex-col justify-between py-6 shrink-0 z-20 transition-all">
      <div className="flex flex-col px-4">
        <Link to="/" className="flex items-center gap-3 px-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-foreground/10 flex items-center justify-center shrink-0 overflow-hidden">
            {logo ? (
              <img src={logo} alt={name} className="w-full h-full object-cover" />
            ) : (
              <Sparkles className="w-4 h-4 text-foreground" />
            )}
          </div>
          <span className="font-bold text-lg hidden md:block text-foreground truncate">{name}</span>
        </Link>

        <nav className="flex flex-col gap-1">
          {mainNav.map((item, i) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.to}
                to={item.to}
                data-active={active}
                style={{ animationDelay: `${i * 40}ms` }}
                className={`nav-item animate-slide-in-left flex items-center gap-3 px-2 py-2.5 rounded-lg ${
                  active
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 transition-transform duration-300 ${active ? "text-primary" : "group-hover:scale-110"}`} />
                <span className="hidden md:block text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col px-4 gap-2">
        <ThemeSwitcher />
        {bottomNav.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors ${
                active
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="hidden md:block text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
        <Link
          to="/login"
          search={{ next: "" }}
          className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors mt-4 border-t border-border pt-6"
        >
          <SquareUserRound className="w-5 h-5 shrink-0" />
          <span className="hidden md:block text-sm font-medium">Sign In</span>
        </Link>
      </div>
    </aside>
  );
}