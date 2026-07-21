import { createFileRoute } from "@tanstack/react-router";
import { Sidebar } from "@/components/Sidebar";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Library — Vard AI" },
      { name: "description", content: "Your saved outputs and collections." },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-2xl font-semibold text-foreground mb-2">Library</h1>
        <p className="text-muted-foreground">
          Your saved outputs and collections will appear here.
        </p>
      </main>
    </div>
  );
}