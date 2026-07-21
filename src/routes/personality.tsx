import { createFileRoute } from "@tanstack/react-router";
import { Sparkles, MessageCircle, Mic2, Sliders, Smile, Type } from "lucide-react";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/personality")({
  head: () => ({
    meta: [
      { title: "Personality — Vard AI" },
      { name: "description", content: "Tune the tone, voice, and response style of your assistant." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      eyebrow="How Vard shows up"
      title="Personality"
      description="Shape the voice, humor, and formality so Vard feels like your assistant, not a generic bot."
      icon={Sparkles}
      features={[
        { icon: Sliders, title: "Formality", description: "From playful sidekick to buttoned-up analyst." },
        { icon: Smile, title: "Humor", description: "Dial wit and warmth up or down." },
        { icon: MessageCircle, title: "Verbosity", description: "Concise answers or full explanations." },
        { icon: Mic2, title: "Speaking voice", description: "Choose a voice profile and accent for spoken replies." },
        { icon: Type, title: "Writing style", description: "Crisp bullets, prose, or executive summary." },
        { icon: Sparkles, title: "Signature phrases", description: "Give Vard a catchphrase or greeting." },
      ]}
    />
  ),
});