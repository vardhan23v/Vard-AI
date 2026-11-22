import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCountUp, useListEntrance, usePresence } from "./motion-hooks";

const reduceMotion = () => document.documentElement.setAttribute("data-reduced-motion", "on");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("usePresence", () => {
  type Item = { id: string };
  const keyOf = (i: Item) => i.id;
  const a = { id: "a" };
  const b = { id: "b" };

  it("keeps a removed item, marked leaving, for one exit", () => {
    const { result, rerender } = renderHook(({ items }) => usePresence(items, keyOf, 220), {
      initialProps: { items: [a, b] },
    });
    expect(result.current).toEqual([
      { item: a, leaving: false },
      { item: b, leaving: false },
    ]);

    rerender({ items: [a] });
    expect(result.current).toEqual([
      { item: a, leaving: false },
      { item: b, leaving: true },
    ]);

    act(() => vi.advanceTimersByTime(220));
    expect(result.current).toEqual([{ item: a, leaving: false }]);
  });

  it("drops a removed item at once under reduced motion", () => {
    reduceMotion();
    const { result, rerender } = renderHook(({ items }) => usePresence(items, keyOf), {
      initialProps: { items: [a, b] },
    });
    rerender({ items: [a] });
    expect(result.current).toEqual([{ item: a, leaving: false }]);
  });
});

describe("useCountUp", () => {
  it("jumps straight to the target under reduced motion", () => {
    reduceMotion();
    const { result, rerender } = renderHook(({ n }) => useCountUp(n), { initialProps: { n: 0 } });
    rerender({ n: 100 });
    expect(result.current).toBe(100);
  });

  it("animates towards the target otherwise", () => {
    const { result, rerender } = renderHook(({ n }) => useCountUp(n, 380), {
      initialProps: { n: 0 },
    });
    rerender({ n: 100 });
    expect(result.current).toBe(0);
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe(100);
  });
});

describe("useListEntrance", () => {
  it("staggers the first render only, then animates just the later additions", () => {
    const { result, rerender } = renderHook(({ keys }) => useListEntrance(keys), {
      initialProps: { keys: ["a", "b"] },
    });
    expect(result.current.list).toBe("stagger");
    expect(result.current.item("a")).toBe("");

    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.list).toBe("");
    expect(result.current.item("a")).toBe("");

    rerender({ keys: ["a", "b", "c"] });
    expect(result.current.list).toBe("");
    expect(result.current.item("b")).toBe("");
    expect(result.current.item("c")).toBe("animate-row-in");
  });

  it("waits while not ready", () => {
    const { result, rerender } = renderHook(({ ready }) => useListEntrance(["a"], ready), {
      initialProps: { ready: false },
    });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.list).toBe("stagger");

    rerender({ ready: true });
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.list).toBe("");
  });
});
