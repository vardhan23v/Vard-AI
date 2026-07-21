import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, TrendingUp, Clock, Cpu, Command, PieChart } from "lucide-react";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Vard AI" },
      { name: "description", content: "Usage stats, most-used commands, and time saved by your assistant." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      eyebrow="Insights"
      title="Analytics"
      description="See how you use Vard, what it does best for you, and how much time it's saving each week."
      icon={BarChart3}
      features={[
        { icon: TrendingUp, title: "Usage trends", description: "Daily and weekly activity over time." },
        { icon: Command, title: "Top commands", description: "Your most-used prompts and shortcuts." },
        { icon: Clock, title: "Time saved", description: "Estimated hours reclaimed by automations." },
        { icon: Cpu, title: "Model mix", description: "Which models handled which kinds of requests." },
        { icon: PieChart, title: "Categories", description: "Work, life, and learning breakdown." },
        { icon: BarChart3, title: "Reports", description: "Weekly digest emailed straight to you." },
      ]}
    />
  ),
});