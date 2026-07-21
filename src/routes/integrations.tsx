import { createFileRoute } from "@tanstack/react-router";
import { Plug, Calendar, Mail, Music, Home, MessageSquare, Github } from "lucide-react";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations — Vard AI" },
      { name: "description", content: "Connect calendar, email, music, smart home, and more." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      eyebrow="Connected life"
      title="Integrations"
      description="Give Vard access to the tools you already use so it can act on your behalf."
      icon={Plug}
      features={[
        { icon: Calendar, title: "Calendar", description: "Google, Apple, and Outlook calendars for scheduling." },
        { icon: Mail, title: "Email", description: "Read, draft, and triage messages with your voice." },
        { icon: Music, title: "Music", description: "Spotify and Apple Music for hands-free playback." },
        { icon: Home, title: "Smart home", description: "Lights, thermostat, and scenes via HomeKit and Matter." },
        { icon: MessageSquare, title: "Messaging", description: "Slack and iMessage summaries and quick replies." },
        { icon: Github, title: "Developer tools", description: "GitHub, Linear, and Notion for work context." },
      ]}
    />
  ),
});