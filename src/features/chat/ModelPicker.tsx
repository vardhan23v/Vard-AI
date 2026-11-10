import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PROVIDERS, modelLabel, useModelChoice } from "@/lib/models";

export function ModelPicker() {
  const [choice, setChoice] = useModelChoice();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={`Model: ${modelLabel(choice)}. Change model`}
      >
        <span className="max-w-[16rem] truncate">{modelLabel(choice)}</span>
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {PROVIDERS.map((p, i) => (
          <div key={p.id}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{p.label}</DropdownMenuLabel>
            {p.models.map((m) => {
              const selected = choice.provider === p.id && choice.model === m.id;
              return (
                <DropdownMenuItem
                  key={m.id}
                  onSelect={() => setChoice({ provider: p.id, model: m.id })}
                  className="flex items-center justify-between gap-2"
                >
                  <span>
                    {m.label}
                    {m.note && <span className="ml-2 text-xs text-muted-foreground">{m.note}</span>}
                  </span>
                  {selected && <Check className="size-4 text-primary" />}
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
