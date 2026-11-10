import { useMemo } from "react";

/**
 * A faint, seeded star field for empty states only — never behind message text.
 * Stars twinkle gently, unless reduced motion is on (then they hold still).
 */
export function StarField({ count = 48, seed = 7 }: { count?: number; seed?: number }) {
  const stars = useMemo(() => {
    let s = seed;
    const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    return Array.from({ length: count }, (_, i) => ({
      x: rand() * 100,
      y: rand() * 100,
      r: rand() < 0.12 ? 1.6 : 0.5 + rand() * 0.7,
      warm: rand() < 0.25,
      delay: (rand() * 8).toFixed(2),
      key: i,
    }));
  }, [count, seed]);

  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
      {stars.map((st) => (
        <circle
          key={st.key}
          cx={`${st.x}%`}
          cy={`${st.y}%`}
          r={st.r}
          className="star-twinkle"
          style={{ animationDelay: `${st.delay}s` }}
          fill={st.warm ? "var(--sn-star)" : "var(--sn-ink)"}
          opacity={st.warm ? 0.55 : 0.35}
        />
      ))}
    </svg>
  );
}
