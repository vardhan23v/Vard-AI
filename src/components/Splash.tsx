/**
 * Shown while the app starts (and by the router while a page's data loads), so the window is
 * never empty. Matches the static splash in index.html. The words appear only after a moment,
 * so a quick start shows just the mark.
 */
export function Splash() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background"
      role="status"
      aria-label="Starting Vard"
    >
      <img src="/icon.svg" alt="" className="size-12 rounded-xl animate-fade-in" />
      <p
        className="text-sm text-muted-foreground animate-fade-in"
        style={{ animationDelay: "1.2s" }}
      >
        Starting Vard…
      </p>
    </div>
  );
}
