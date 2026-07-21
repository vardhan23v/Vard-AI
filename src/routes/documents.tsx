import { createFileRoute } from "@tanstack/react-router";
import { FileText, Upload, FolderTree, Search, Link2, ShieldCheck } from "lucide-react";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Documents — Vard AI" },
      { name: "description", content: "Upload files your assistant can reference and cite." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      eyebrow="Your knowledge base"
      title="Documents"
      description="Upload PDFs, notes, and specs so Vard can answer with your own material — with sources cited."
      icon={FileText}
      features={[
        { icon: Upload, title: "Upload anything", description: "PDFs, Markdown, DOCX, spreadsheets, and code." },
        { icon: FolderTree, title: "Collections", description: "Organize by project, client, or topic." },
        { icon: Search, title: "Semantic search", description: "Find the right passage by meaning, not just keywords." },
        { icon: Link2, title: "Citations", description: "Every answer links back to the source paragraph." },
        { icon: ShieldCheck, title: "Private", description: "Your files stay yours — encrypted and scoped to you." },
        { icon: FileText, title: "Live sync", description: "Connect Google Drive or Notion for auto-updates." },
      ]}
    />
  ),
});