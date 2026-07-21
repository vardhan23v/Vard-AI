import { createFileRoute } from "@tanstack/react-router";
import { Zap, Clock, Repeat, CalendarClock, Bell, Workflow } from "lucide-react";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/automations")({
  head: () => ({
    meta: [
      { title: "Automations — Vard AI" },
      { name: "description", content: "Scheduled routines and recurring tasks Vard runs for you." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      eyebrow="Set it and forget it"
      title="Automations"
      description="Design routines that run on a schedule or trigger — from morning briefings to weekly reports."
      icon={Zap}
      features={[
        { icon: Clock, title: "Schedules", description: "Daily, weekly, or cron-style timing for any routine." },
        { icon: Repeat, title: "Recurring tasks", description: "Reminders and follow-ups that never fall through." },
        { icon: CalendarClock, title: "Morning briefing", description: "Weather, calendar, and priorities delivered at wake-up." },
        { icon: Bell, title: "Smart alerts", description: "Notify you only when it actually matters." },
        { icon: Workflow, title: "Multi-step flows", description: "Chain actions across your integrations." },
        { icon: Zap, title: "Triggers", description: "Fire routines on email, calendar events, or webhooks." },
      ]}
    />
  ),
});