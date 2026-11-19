import { createFileRoute } from "@tanstack/react-router";
import { CodePage } from "@/features/code/CodePage";

export const Route = createFileRoute("/code/")({
  component: CodePage,
});
