/** Semantic search settings for a project's code index: embeddings provider and model. */
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CodeConfig } from "@/lib/agent-client";

type Embeddings = CodeConfig["embeddings"];

const DEFAULT_MODEL: Record<Embeddings["provider"], string> = {
  none: "",
  ollama: "nomic-embed-text",
  openai: "text-embedding-3-small",
  google: "text-embedding-004",
};

export function EmbeddingsEditor({
  value,
  onSave,
}: {
  value: Embeddings;
  onSave: (embeddings: Embeddings) => void;
}) {
  const [model, setModel] = useState<string | null>(null);
  const shownModel = model ?? value.model ?? "";
  const keep = (e: Embeddings): Embeddings =>
    e.provider === "ollama" && value.baseUrl ? { ...e, baseUrl: value.baseUrl } : e;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value.provider}
        onValueChange={(v) => {
          setModel(null);
          onSave(keep({ provider: v as Embeddings["provider"] }));
        }}
      >
        <SelectTrigger aria-label="Embeddings provider" className="w-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Off</SelectItem>
          <SelectItem value="ollama">Ollama on this Mac (nomic-embed-text)</SelectItem>
          <SelectItem value="openai">OpenAI (text-embedding-3-small)</SelectItem>
          <SelectItem value="google">Google (text-embedding-004)</SelectItem>
        </SelectContent>
      </Select>
      {value.provider !== "none" && (
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(keep({ provider: value.provider, model: shownModel.trim() || undefined }));
            setModel(null);
          }}
        >
          <input
            value={shownModel}
            onChange={(e) => setModel(e.target.value)}
            aria-label="Embeddings model"
            placeholder={`Model (default ${DEFAULT_MODEL[value.provider]})`}
            maxLength={200}
            className="h-9 min-w-48 flex-1 rounded-md border border-input bg-background px-2 font-mono text-xs"
          />
          <button
            disabled={model === null}
            className="press min-h-9 rounded-md border border-input px-3 text-sm hover:bg-accent disabled:opacity-50"
          >
            Save model
          </button>
        </form>
      )}
    </div>
  );
}
