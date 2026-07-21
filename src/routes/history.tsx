import { createFileRoute } from "@tanstack/react-router";
import { History, Search, Filter, Tag, Download, Clock } from "lucide-react";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History — Vard AI" },
      { name: "description", content: "A searchable log of every conversation with your assistant." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      eyebrow="Everything, remembered"
      title="History"
      description="Search, filter, and revisit every conversation and command from the beginning."
      icon={History}
      features={[
        { icon: Search, title: "Full-text search", description: "Find any word from any past chat instantly." },
        { icon: Filter, title: "Filters", description: "By date, topic, agent, or integration used." },
        { icon: Tag, title: "Tags", description: "Label conversations so they surface later." },
        { icon: Clock, title: "Timeline", description: "Scrub through your assistant's history by day." },
        { icon: Download, title: "Export", description: "Download transcripts as Markdown or JSON." },
        { icon: History, title: "Resume", description: "Pick any past conversation back up where you left off." },
      ]}
    />
  ),
});