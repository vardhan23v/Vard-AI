import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { MoreHorizontal, Pin, PinOff, Search, SquarePen, Trash2, Pencil } from "lucide-react";
import { isToday, isYesterday, subDays, isAfter } from "date-fns";

import { conversationsQuery, useConversationActions, type Conversation } from "@/features/chat/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function bucket(c: Conversation) {
  if (c.pinned) return "Pinned";
  const d = new Date(c.updated_at);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (isAfter(d, subDays(new Date(), 7))) return "Previous 7 days";
  return "Older";
}

export function ConversationList() {
  const { data, isLoading, error, refetch } = useQuery(conversationsQuery());
  const [filter, setFilter] = useState("");
  const params = useParams({ strict: false }) as { conversationId?: string };
  const navigate = useNavigate();
  const { rename, togglePin, remove } = useConversationActions();

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const rows = (data ?? []).filter((c) => !q || c.title.toLowerCase().includes(q));
    const out = new Map<string, Conversation[]>();
    for (const c of rows) {
      const b = bucket(c);
      out.set(b, [...(out.get(b) ?? []), c]);
    }
    return [...out.entries()];
  }, [data, filter]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pt-1 pb-2">
        <h2 className="font-sans text-sm font-semibold text-foreground">Chats</h2>
        <Link
          to="/chat"
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="New chat"
          title="New chat (⌘N)"
        >
          <SquarePen className="size-4" />
        </Link>
      </div>
      <div className="px-3 pb-2">
        <label className="relative block">
          <span className="sr-only">Search chats</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search"
            className="h-8 w-full rounded-md border border-border bg-background/40 pr-2 pl-8 text-sm outline-none placeholder:text-muted-foreground focus:border-input"
          />
        </label>
      </div>

      <nav aria-label="Chats" className="flex-1 overflow-y-auto px-2 pb-3">
        {isLoading && (
          <div className="space-y-2 px-1 pt-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        )}
        {error && (
          <div className="px-2 pt-2 text-sm text-muted-foreground">
            <p>Couldn't load chats.</p>
            <p className="mt-1 text-xs">{error.message}</p>
            <button onClick={() => refetch()} className="mt-2 text-primary underline underline-offset-2">
              Try again
            </button>
          </div>
        )}
        {!isLoading && !error && groups.length === 0 && (
          <p className="px-2 pt-2 text-sm text-muted-foreground">
            {filter ? "No chats match." : "No chats yet. Start one from the composer."}
          </p>
        )}
        {groups.map(([label, rows]) => (
          <section key={label} className="mt-3 first:mt-1">
            <h3 className="px-2 pb-1 font-sans text-xs font-medium text-muted-foreground">{label}</h3>
            <ul>
              {rows.map((c) => {
                const active = params.conversationId === c.id;
                return (
                  <li key={c.id} className="group relative">
                    <Link
                      to="/chat/$conversationId"
                      params={{ conversationId: c.id }}
                      className={cn(
                        "block truncate rounded-md py-1.5 pr-8 pl-2 text-sm",
                        active ? "bg-accent text-foreground" : "text-foreground/85 hover:bg-accent/60",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      {c.title}
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="absolute top-1/2 right-1 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                        aria-label={`Options for ${c.title}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            const title = window.prompt("Rename chat", c.title)?.trim();
                            if (title) rename.mutate({ id: c.id, title });
                          }}
                        >
                          <Pencil className="size-4" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => togglePin.mutate({ id: c.id, pinned: !c.pinned })}>
                          {c.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                          {c.pinned ? "Unpin" : "Pin"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => {
                            if (!window.confirm(`Delete “${c.title}”? This can't be undone.`)) return;
                            remove.mutate(c.id);
                            if (active) void navigate({ to: "/chat" });
                          }}
                        >
                          <Trash2 className="size-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>
    </div>
  );
}
