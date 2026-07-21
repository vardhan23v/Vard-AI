import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "@/components/Sidebar";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Workspace — Vard AI" },
      { name: "description", content: "Your Vard AI workspace and chat." },
      { property: "og:title", content: "Workspace — Vard AI" },
      { property: "og:description", content: "Your Vard AI workspace and chat." },
    ],
  }),
  component: DashboardLayout,
});

function DashboardLayout() {
  return (
    <div className="flex min-h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col relative">
        <Outlet />
      </main>
    </div>
  );
}