import type { DbTableName } from "./schema";

const PREFIX = "holographic:db:";
const VERSION = "v4"; // bumped for compliance tables

function storageKey(table: DbTableName): string {
  return `${PREFIX}${VERSION}:${table}`;
}

function loadTable<T>(table: DbTableName): T[] {
  try {
    const raw = localStorage.getItem(storageKey(table));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTable<T>(table: DbTableName, data: T[]): void {
  try {
    localStorage.setItem(storageKey(table), JSON.stringify(data));
  } catch (e) {
    console.error(`[DB] Failed to save ${table}`, e);
    throw new Error(`Database error: failed to persist ${table}`);
  }
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const db = {
  getAll<T>(table: DbTableName): T[] {
    return loadTable<T>(table);
  },

  getById<T extends { id: string }>(table: DbTableName, id: string): T | null {
    const all = loadTable<T>(table);
    return all.find((r) => r.id === id) ?? null;
  },

  find<T>(table: DbTableName, predicate: (item: T) => boolean): T[] {
    const all = loadTable<T>(table);
    return all.filter(predicate);
  },

  create<T>(table: DbTableName, item: any): T {
    const all = loadTable<T>(table);
    if (table === "execution_requests" && item.intentHash) {
      const existing = all.find((r: any) => r.intentHash === item.intentHash && r.agentDeploymentId === item.agentDeploymentId);
      if (existing) return existing;
    }
    if (table === "audit_requests" && item.subjectId && item.reason) {
      const existing = all.find(
        (r: any) => r.subjectId === item.subjectId && r.reason === item.reason && r.userId === item.userId && r.status === "PENDING",
      );
      if (existing) throw new Error("Duplicate audit request: pending request already exists for same subject and reason");
    }
    const newItem = {
      ...item,
      id: item.id ?? generateId(table.slice(0, 3)),
      createdAt: item.createdAt ?? Date.now(),
    } as T;
    all.push(newItem);
    saveTable(table, all);
    return newItem;
  },

  update<T>(table: DbTableName, id: string, updates: any): T | null {
    const all = loadTable<T>(table);
    const idx = all.findIndex((r: any) => r.id === id);
    if (idx === -1) return null;
    const updated = {
      ...(all[idx] as any),
      ...updates,
      updatedAt: Date.now(),
    } as T;
    all[idx] = updated;
    saveTable(table, all);
    return updated;
  },

  delete(table: DbTableName, id: string): boolean {
    const all = loadTable<any>(table);
    const filtered = all.filter((r: any) => r.id !== id);
    if (filtered.length === all.length) return false;
    saveTable(table, filtered);
    return true;
  },

  clear(table: DbTableName): void {
    try {
      localStorage.removeItem(storageKey(table));
    } catch {}
  },

  clearAll(): void {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(PREFIX)) localStorage.removeItem(key);
      });
    } catch {}
  },

  generateId,

  getUserByAddress(address: string): any | null {
    const users = loadTable<any>("users");
    return users.find((u: any) => u.address.toLowerCase() === address.toLowerCase()) ?? null;
  },

  getWalletsByUser(userId: string): any[] {
    return loadTable<any>("wallets").filter((w: any) => w.userId === userId);
  },

  getActiveWalletByUser(userId: string): any | null {
    return loadTable<any>("wallets").find((w: any) => w.userId === userId && w.status === "connected") ?? null;
  },

  getDeploymentsByUser(userId: string): any[] {
    return loadTable<any>("agent_deployments").filter((d: any) => d.userId === userId);
  },

  getActiveDeploymentsByUser(userId: string): any[] {
    return loadTable<any>("agent_deployments").filter((d: any) => d.userId === userId && (d.status === "ACTIVE" || d.status === "active"));
  },

  getDeploymentById(id: string): any | null {
    return loadTable<any>("agent_deployments").find((d: any) => d.id === id) ?? null;
  },

  getPoliciesByDeployment(deploymentId: string): any[] {
    return loadTable<any>("policies").filter((p: any) => p.agentDeploymentId === deploymentId);
  },

  getPoliciesByUser(userId: string): any[] {
    return loadTable<any>("policies").filter((p: any) => p.userId === userId);
  },

  getRecipientsByPolicy(policyId: string): any[] {
    return loadTable<any>("approved_recipients").filter((r: any) => r.policyId === policyId);
  },

  getActiveRecipientsByPolicy(policyId: string): any[] {
    return loadTable<any>("approved_recipients").filter((r: any) => r.policyId === policyId && r.active);
  },

  getExecutionRequestsByDeployment(deploymentId: string): any[] {
    return loadTable<any>("execution_requests").filter((r: any) => r.agentDeploymentId === deploymentId);
  },

  getExecutionRequestsByUser(userId: string): any[] {
    return loadTable<any>("execution_requests").filter((r: any) => r.userId === userId);
  },

  getPendingApprovalsByUser(userId: string): any[] {
    return loadTable<any>("execution_requests").filter(
      (r: any) => r.userId === userId && (r.status === "awaiting_confirmation" || r.status === "AWAITING_USER"),
    );
  },

  getReceiptsByUser(userId: string): any[] {
    return loadTable<any>("execution_receipts").filter((r: any) => r.userId === userId);
  },

  getPolicyDecisionsByRequest(requestId: string): any[] {
    return loadTable<any>("policy_decisions").filter((d: any) => d.executionRequestId === requestId);
  },

  getAgentVersionsByAgent(agentId: string): any[] {
    return loadTable<any>("agent_versions").filter((v: any) => v.agentId === agentId);
  },

  getAgentCapabilitiesByAgent(agentId: string): any[] {
    return loadTable<any>("agent_capabilities").filter((c: any) => c.agentId === agentId);
  },

  getAgentMetricsByAgent(agentId: string): any | null {
    return loadTable<any>("agent_metrics").find((m: any) => m.agentId === agentId) ?? null;
  },

  getNotificationsByUser(userId: string): any[] {
    return loadTable<any>("notifications").filter((n: any) => n.userId === userId).sort((a: any, b: any) => b.createdAt - a.createdAt);
  },

  getAuditRequestsByUser(userId: string): any[] {
    return loadTable<any>("audit_requests").filter((r: any) => r.userId === userId);
  },

  getAuditEventsByUser(userId: string): any[] {
    return loadTable<any>("audit_events").filter((e: any) => e.userId === userId);
  },

  getVerificationResultsByUser(userId: string): any[] {
    return loadTable<any>("verification_results").filter((r: any) => r.userId === userId);
  },

  isAvailable(): boolean {
    try {
      const test = "__holographic_db_test__";
      localStorage.setItem(test, "1");
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  },
};

export type DbClient = typeof db;
