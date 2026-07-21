import { createFileRoute } from "@tanstack/react-router";
import { Mic, Volume2, Waves, Palette, Sparkles, Radio } from "lucide-react";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/voice")({
  head: () => ({
    meta: [
      { title: "Voice & Avatar — Vard AI" },
      { name: "description", content: "Customize the orb animation and your assistant's speaking voice." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      eyebrow="Look and sound"
      title="Voice & Avatar"
      description="Choose how Vard appears and sounds — from orb style to speaking cadence."
      icon={Mic}
      features={[
        { icon: Waves, title: "Orb animation", description: "Nebula, aurora, pulse, or minimal ring." },
        { icon: Palette, title: "Colorways", description: "Match the orb to your accent theme." },
        { icon: Volume2, title: "Voice profile", description: "Pick from natural voices and accents." },
        { icon: Radio, title: "Speaking pace", description: "Faster for skimming, slower for focus." },
        { icon: Sparkles, title: "Micro-reactions", description: "Subtle chimes and haptic-style motion cues." },
        { icon: Mic, title: "Wake word", description: "Custom phrase to summon Vard hands-free." },
      ]}
    />
  ),
});