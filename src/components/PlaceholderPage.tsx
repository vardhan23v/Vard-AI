import type { ComponentType, ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { useEffect, useRef, useState } from "react";

export type PlaceholderFeature = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
};

type Props = {
  eyebrow?: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  features: PlaceholderFeature[];
  cta?: ReactNode;
};

export function PlaceholderPage({ eyebrow, title, description, icon: Icon, features, cta }: Props) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <div className="flex items-start gap-4 mb-10 animate-fade-up">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 animate-glow-pulse">
              <Icon className="w-6 h-6 text-primary animate-float" />
            </div>
            <div>
              {eyebrow && (
                <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
                  {eyebrow}
                </div>
              )}
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
              <p className="mt-2 text-muted-foreground max-w-2xl">{description}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => {
              const FIcon = f.icon;
              return (
                <RevealCard key={f.title} delay={i * 80}>
                  <div className="group tile-hover rounded-2xl border border-border bg-card/50 backdrop-blur p-5 h-full">
                    <div className="w-10 h-10 rounded-xl bg-foreground/5 flex items-center justify-center mb-4 transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110">
                      <FIcon className="w-5 h-5 text-foreground" />
                    </div>
                    <div className="text-sm font-semibold text-foreground mb-1">{f.title}</div>
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      {f.description}
                    </div>
                  </div>
                </RevealCard>
              );
            })}
          </div>

          {cta && <div className="mt-10">{cta}</div>}

          <div className="mt-10 text-xs text-muted-foreground">
            Coming soon · This surface is scaffolded and ready to wire up.
          </div>
        </div>
      </main>
    </div>
  );
}

function RevealCard({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { setShown(true); io.unobserve(e.target); }
      }),
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${shown ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-6 blur-sm"}`}
    >
      {children}
    </div>
  );
}