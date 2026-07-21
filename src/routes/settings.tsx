import { createFileRoute } from "@tanstack/react-router";
import { Sidebar } from "@/components/Sidebar";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Vard AI" },
      { name: "description", content: "Account and workspace settings." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-2xl font-semibold text-foreground mb-2">Settings</h1>
        <p className="text-muted-foreground">
          Account and workspace settings will appear here.
        </p>
      </main>
    </div>
  );
}