/**
 * Development-only structured logger for wallet connection flow
 * Per TASK 1: logs each step with success/failure, exact error, error code
 * Does NOT log private keys, seed phrases, viewing keys, notes, signatures
 */

export type LogStep =
  | "STEP_1_DISCOVERY_STARTED"
  | "STEP_2_AVAILABLE_WALLETS"
  | "STEP_3_SELECTED_WALLET"
  | "STEP_4_CREATING_PROVIDER"
  | "STEP_5_CALLING_WALLETACCOUNT_CONNECT"
  | "STEP_6_WALLET_AUTHORIZATION_RESULT"
  | "STEP_7_ADDRESS_DETECTED"
  | "STEP_8_CHAIN_ID_DETECTED"
  | "STEP_9_CAPABILITY_DETECTION"
  | "STEP_10_CONNECTION_COMPLETE";

export interface LogEntry {
  step: LogStep;
  success: boolean;
  message?: string;
  error?: {
    name: string;
    message: string;
    code?: string | number;
    stack?: string;
    cause?: unknown;
  };
  data?: Record<string, unknown>;
  timestamp: number;
}

const logs: LogEntry[] = [];

function isDev(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        (import.meta as unknown as { env?: { DEV?: boolean } })?.env?.DEV === true)
    );
  } catch {
    return false;
  }
}

export function logStep(
  step: LogStep,
  success: boolean,
  opts: {
    message?: string;
    error?: unknown;
    data?: Record<string, unknown>;
  } = {},
) {
  const entry: LogEntry = {
    step,
    success,
    timestamp: Date.now(),
    message: opts.message,
    data: opts.data,
  };

  if (opts.error) {
    const err = opts.error as Record<string, unknown>;
    entry.error = {
      name: (err.name as string) ?? (err.constructor?.name as string) ?? "UnknownError",
      message: (err.message as string) ?? String(err),
      code: (err.code as string | number) ?? (err.status as string | number) ?? undefined,
      stack: isDev() ? ((err.stack as string)?.slice(0, 1000) as string) : undefined,
      cause: (err.cause as unknown) ?? undefined,
    };
  }

  logs.push(entry);

  if (isDev()) {
    const prefix = `[Holographic][${step}] ${success ? "✓" : "✗"}`;
    if (success) {
      console.log(prefix, opts.message ?? "", opts.data ?? "");
    } else {
      console.error(prefix, opts.message ?? "", entry.error, opts.data ?? "");
    }
  }
}

export function getLogs(): LogEntry[] {
  return [...logs];
}

export function clearLogs() {
  logs.length = 0;
}

export function getLastError(): LogEntry | null {
  for (let i = logs.length - 1; i >= 0; i--) {
    if (!logs[i].success && logs[i].error) return logs[i];
  }
  return null;
}
