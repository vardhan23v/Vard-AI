import { createFileRoute } from "@tanstack/react-router";
import { Brain, User, Heart, MapPin, Briefcase, Star } from "lucide-react";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/memory")({
  head: () => ({
    meta: [
      { title: "Memory — Vard AI" },
      { name: "description", content: "Facts, preferences, and people Vard remembers about you." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      eyebrow="Long-term recall"
      title="Memory"
      description="Facts, preferences, and people your assistant should remember across every conversation."
      icon={Brain}
      features={[
        { icon: User, title: "About you", description: "Name, role, timezone, and how you like to be addressed." },
        { icon: Heart, title: "Preferences", description: "Tastes, dietary needs, favorite tools, and defaults." },
        { icon: Star, title: "People", description: "Family, teammates, and contacts with context Vard can use." },
        { icon: MapPin, title: "Places", description: "Home, work, and frequently visited locations." },
        { icon: Briefcase, title: "Projects", description: "Ongoing work Vard should track and reference." },
        { icon: Brain, title: "Auto-captured", description: "Facts Vard learns from your conversations, editable anytime." },
      ]}
    />
  ),
});