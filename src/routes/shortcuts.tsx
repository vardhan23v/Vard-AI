import { createFileRoute } from "@tanstack/react-router";
import { Command, Slash, Keyboard, Zap, Star, Plus } from "lucide-react";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/shortcuts")({
  head: () => ({
    meta: [
      { title: "Shortcuts — Vard AI" },
      { name: "description", content: "Custom slash commands and quick phrases for your assistant." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      eyebrow="Speed"
      title="Shortcuts"
      description="Slash commands and quick phrases that trigger multi-step actions in one tap."
      icon={Command}
      features={[
        { icon: Slash, title: "Slash commands", description: "Type /brief, /summarize, /plan and Vard runs the routine." },
        { icon: Keyboard, title: "Hotkeys", description: "Global shortcuts to summon Vard from anywhere." },
        { icon: Zap, title: "Quick phrases", description: "Save common prompts as one-tap chips." },
        { icon: Star, title: "Favorites", description: "Pin the shortcuts you use most to the top of the bar." },
        { icon: Plus, title: "Create your own", description: "Turn any workflow into a personal command." },
        { icon: Command, title: "Share", description: "Export shortcut packs to teammates or friends." },
      ]}
    />
  ),
});