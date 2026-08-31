/**
 * Minimal zero-dependency test harness — now async-aware.
 *
 * Mirrors Vitest/Jest surface (`describe` / `it` / `expect`) so the suite
 * runs unchanged under Vitest once a runner is added:
 *     import { describe, it, expect } from "vitest";
 *
 * Until then the same suite executes in-browser via EngineConformance.
 */

export interface TestCase {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export interface TestGroup {
  name: string;
  cases: TestCase[];
}

interface Registered {
  group: string;
  name: string;
  fn: () => void | Promise<void>;
}

const registry: Registered[] = [];
let currentGroup = "ungrouped";

export function clearRegistry() {
  registry.length = 0;
}

export function describe(name: string, fn: () => void): void {
  const previous = currentGroup;
  currentGroup = name;
  fn();
  currentGroup = previous;
}

export function it(name: string, fn: () => void | Promise<void>): void {
  registry.push({ group: currentGroup, name, fn });
}

export const test = it;

class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

const show = (v: unknown): string => {
  if (typeof v === "string") return JSON.stringify(v);
  if (v instanceof Set) return `Set(${[...v].map(show).join(", ")})`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
};

export function expect(actual: unknown) {
  const api = {
    toBe(expected: unknown) {
      if (!Object.is(actual, expected)) {
        throw new AssertionError(`expected ${show(expected)} but received ${show(actual)}`);
      }
    },
    toEqual(expected: unknown) {
      if (!deepEqual(actual, expected)) {
        throw new AssertionError(
          `expected deep equality with ${show(expected)} but received ${show(actual)}`,
        );
      }
    },
    toHaveLength(n: number) {
      const len = (actual as { length?: number })?.length;
      if (len !== n) {
        throw new AssertionError(`expected length ${n} but received ${show(len)}`);
      }
    },
    toContain(needle: unknown) {
      const ok = Array.isArray(actual)
        ? actual.includes(needle)
        : typeof actual === "string" && typeof needle === "string"
          ? actual.includes(needle)
          : false;
      if (!ok) {
        throw new AssertionError(`expected ${show(actual)} to contain ${show(needle)}`);
      }
    },
    toContainMatch(fragment: string) {
      const arr = (actual as unknown[]) ?? [];
      const ok = Array.isArray(arr) && arr.some((x) => String(x).includes(fragment));
      if (!ok) {
        throw new AssertionError(
          `expected some entry of ${show(actual)} to include ${show(fragment)}`,
        );
      }
    },
    toBeGreaterThan(n: number) {
      if (!((actual as number) > n)) {
        throw new AssertionError(`expected ${show(actual)} > ${n}`);
      }
    },
    get not() {
      return {
        toContainMatch(fragment: string) {
          const arr = (actual as unknown[]) ?? [];
          if (Array.isArray(arr) && arr.some((x) => String(x).includes(fragment))) {
            throw new AssertionError(
              `expected no entry of ${show(actual)} to include ${show(fragment)}`,
            );
          }
        },
        toBe(expected: unknown) {
          if (Object.is(actual, expected)) {
            throw new AssertionError(`expected value not to be ${show(expected)}`);
          }
        },
      };
    },
  };
  return api;
}

export interface SuiteReport {
  groups: TestGroup[];
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
}

export async function runSuiteAsync(): Promise<SuiteReport> {
  const started = performance.now();
  const byGroup = new Map<string, TestCase[]>();

  for (const entry of registry) {
    const t0 = performance.now();
    let passed = true;
    let error: string | undefined;
    try {
      await entry.fn();
    } catch (e) {
      passed = false;
      error = e instanceof Error ? e.message : String(e);
    }
    const cases = byGroup.get(entry.group) ?? [];
    cases.push({ name: entry.name, passed, error, durationMs: performance.now() - t0 });
    byGroup.set(entry.group, cases);
  }

  const groups = [...byGroup.entries()].map(([name, cases]) => ({ name, cases }));
  const all = groups.flatMap((g) => g.cases);

  return {
    groups,
    total: all.length,
    passed: all.filter((c) => c.passed).length,
    failed: all.filter((c) => !c.passed).length,
    durationMs: performance.now() - started,
  };
}

/** Sync wrapper — runs async suite but returns last cached if called synchronously */
let _lastReport: SuiteReport | null = null;

export function runSuite(): SuiteReport {
  // If we have not yet run async, run sync versions only for backward compat
  // This returns empty if registry contains async tests — use runSuiteAsync in new code
  if (_lastReport) return _lastReport;
  const started = performance.now();
  const byGroup = new Map<string, TestCase[]>();
  for (const entry of registry) {
    const t0 = performance.now();
    let passed = true;
    let error: string | undefined;
    try {
      const res = entry.fn();
      if (res instanceof Promise) {
        // Skip async tests in sync run
        continue;
      }
    } catch (e) {
      passed = false;
      error = e instanceof Error ? e.message : String(e);
    }
    const cases = byGroup.get(entry.group) ?? [];
    cases.push({ name: entry.name, passed, error, durationMs: performance.now() - t0 });
    byGroup.set(entry.group, cases);
  }
  const groups = [...byGroup.entries()].map(([name, cases]) => ({ name, cases }));
  const all = groups.flatMap((g) => g.cases);
  return {
    groups,
    total: all.length,
    passed: all.filter((c) => c.passed).length,
    failed: all.filter((c) => !c.passed).length,
    durationMs: performance.now() - started,
  };
}

export function setLastReport(r: SuiteReport) {
  _lastReport = r;
}
