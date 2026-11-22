import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(() => Promise.resolve());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

/** boot.ts keeps module state (`storage`, the log), so each test gets a fresh copy. */
async function loadBoot() {
  vi.resetModules();
  return import("./boot");
}

describe("warmUpStorage", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("falls back from IndexedDB when the probe never answers", async () => {
    const open = vi.fn(() => ({}) as IDBOpenDBRequest); // never fires a callback
    vi.stubGlobal("indexedDB", { open });
    const boot = await loadBoot();

    const done = boot.warmUpStorage();
    await vi.advanceTimersByTimeAsync(5000);
    await done;

    expect(open).toHaveBeenCalledTimes(2);
    expect(boot.storage.indexedDB).toBe(false);
    expect(boot.bootLines().some((l) => l.includes("indexeddb unavailable"))).toBe(true);
  });

  it("keeps IndexedDB when the probe answers", async () => {
    const close = vi.fn();
    const open = vi.fn(() => {
      const req = { result: { close } } as unknown as IDBOpenDBRequest;
      void Promise.resolve().then(() => req.onsuccess?.(new Event("success")));
      return req;
    });
    vi.stubGlobal("indexedDB", { open });
    const boot = await loadBoot();

    await boot.warmUpStorage();

    expect(open).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalled();
    expect(boot.storage.indexedDB).toBe(true);
  });

  it("falls back when indexedDB.open throws", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new Error("denied");
      },
    });
    const boot = await loadBoot();
    await boot.warmUpStorage();
    expect(boot.storage.indexedDB).toBe(false);
  });
});

describe("bootLog", () => {
  it("records lines and does not throw or call Tauri outside the desktop app", async () => {
    const boot = await loadBoot();
    expect("__TAURI_INTERNALS__" in window).toBe(false);
    expect(() => boot.bootLog("hello")).not.toThrow();
    expect(boot.bootLines().at(-1)).toMatch(/^\+\d+ms hello$/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("logs a step only once with mark()", async () => {
    const boot = await loadBoot();
    boot.mark("x");
    boot.mark("x");
    expect(boot.bootLines().filter((l) => l.endsWith("mark x"))).toHaveLength(1);
  });
});
