import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { poseidonish } from "./hash";
import { MOCK_AGENTS } from "./mock/agents";
import { defaultPolicy as legacyDefaultPolicy, MOCK_POLICIES } from "./mock/policies";
import { MOCK_RECEIPTS } from "./mock/receipts";
import { MOCK_POSITIONS } from "./mock/treasury";
import { useWallet } from "./wallet/useWallet";
import type {
  Agent,
  BindingState,
  ExecutionReceiptData,
  PolicyDocument,
  PolicyRecord,
  TreasuryPosition,
} from "./types";
import { db } from "./db/client";
import type {
  DbAgentDeployment,
  DbApprovedRecipient,
  DbExecutionRequest,
  DbExecutionReceipt,
  DbPolicy,
  DbUser,
  DbWallet,
  DbAgent,
  DbAgentVersion,
  DbNotification,
  DbAgentMetrics,
  DbPaymentSchedule,
  DbScheduleOccurrence,
  DbBudget,
  DbPaymentRequest,
  DbPaymentBatch,
  DbWorkflowDefinition,
  DbWorkflowRun,
  DbAutomationControl,
  DbScheduleVersion,
  DbNewRecipientReview,
  DbEmergencyEvent,
  ScheduleFrequency,
  ApprovalMode,
  BudgetPeriod,
} from "./db/schema";
import { ensureUser } from "./api/users";
import { ensureWallet, disconnectWalletsByUser } from "./api/wallets";
import { seedAgents, getAllAgents } from "./api/agents";
import { deployAgent as apiDeployAgent, getDeploymentsByUser, pauseDeployment, resumeDeployment, disableDeployment } from "./api/deployments";
import { getPoliciesByUser } from "./api/policies";
import { getRecipientsByUser, addRecipient as apiAddRecipient, removeRecipient, disableRecipient, enableRecipient } from "./api/recipients";
import { getReceiptsByUser, getPendingApprovalsByUser, getExecutionRequestsByUser } from "./api/executions";
import type { AgentPolicy } from "./policy/model";
import { makePolicy } from "./policy/model";
import {
  createSchedule,
  updateSchedule,
  getScheduleVersions,
  getSchedulesByUser,
  pauseSchedule,
  resumeSchedule,
  cancelSchedule,
  getOccurrencesByUser,
  proposeManualOccurrence,
  retryOccurrence,
  createBudget,
  getBudgetsByUser,
  pauseBudget,
  resumeBudget,
  createPaymentRequest,
  getPaymentRequestsByUser,
  approvePaymentRequest,
  rejectPaymentRequest,
  createBatch,
  getBatchesByUser,
  cancelBatch,
  type BatchItemInput,
  createWorkflowDefinition,
  getWorkflowDefinitionsByUser,
  getRunsByUser,
  startWorkflowRun,
  approveWorkflowStep,
  rejectWorkflowRun,
  getAutomationControl,
  pauseAllAutomation,
  resumeAutomation,
  updateEmergencyRules,
  getEmergencyEvents,
  getNewRecipientReviewsByUser,
  approveNewRecipientReview,
  rejectNewRecipientReview,
  authorizeExecutionRequest,
  approveExecutionRequest,
  rejectExecutionRequest,
} from "./api";
import { runSchedulerTick } from "./scheduler/worker";

type Theme = "dark" | "light";

interface Store {
  theme: Theme;
  toggleTheme: () => void;
  wallet: ReturnType<typeof useWallet>["wallet"];
  connect: () => Promise<ReturnType<typeof useWallet>["wallet"]>;
  connectReal: () => Promise<ReturnType<typeof useWallet>["wallet"]>;
  connectReady: () => Promise<ReturnType<typeof useWallet>["wallet"]>;
  connectWalletConnect: () => Promise<ReturnType<typeof useWallet>["wallet"]>;
  connectMock: () => Promise<ReturnType<typeof useWallet>["wallet"]>;
  diagnostic: ReturnType<typeof useWallet>["diagnostic"];
  walletError: string | null;
  errorDetails: ReturnType<typeof useWallet>["errorDetails"];
  adapter: ReturnType<typeof useWallet>["adapter"];
  disconnect: () => Promise<void>;
  agents: Agent[];
  dbAgents: DbAgent[];
  positions: TreasuryPosition[];
  policies: PolicyRecord[];
  receipts: ExecutionReceiptData[];
  bindingState: Record<string, BindingState>;
  policyFor: (agentId: string) => PolicyDocument;
  savePolicy: (agentId: string, doc: PolicyDocument, label?: string) => void;
  addReceipt: (r: ExecutionReceiptData) => void;
  recordExecution: (agentId: string, amountUsd: number) => void;
  setAgentRuntime: (agentId: string, runtime: Agent["runtime"]) => void;
  pauseAgentDeployment: (deploymentId: string) => any;
  resumeAgentDeployment: (deploymentId: string) => any;
  decommissionAgentDeployment: (deploymentId: string) => any;
  dbUser: DbUser | null;
  dbWallet: DbWallet | null;
  deployments: DbAgentDeployment[];
  dbPolicies: DbPolicy[];
  recipients: DbApprovedRecipient[];
  executionRequests: DbExecutionRequest[];
  dbReceipts: DbExecutionReceipt[];
  pendingApprovals: DbExecutionRequest[];
  agentVersions: DbAgentVersion[];
  notifications: DbNotification[];
  agentMetrics: DbAgentMetrics[];
  deployTreasuryAgent: (policy?: AgentPolicy, label?: string) => { deployment: DbAgentDeployment; policyRecord: DbPolicy } | null;
  deployAgent: (agentId: string, policy?: AgentPolicy, label?: string) => { deployment: DbAgentDeployment; policyRecord: DbPolicy } | null;
  addApprovedRecipient: (policyId: string, name: string, address: string, asset: string) => DbApprovedRecipient | null;
  removeApprovedRecipient: (id: string) => boolean;
  toggleRecipient: (id: string, active: boolean) => DbApprovedRecipient | null;
  refreshFromDb: () => void;
  markNotificationRead: (id: string) => void;

  // Treasury automation — schedules, budgets, batches, requests, workflows, automation controls
  schedules: DbPaymentSchedule[];
  scheduleOccurrences: DbScheduleOccurrence[];
  budgets: DbBudget[];
  paymentRequests: DbPaymentRequest[];
  batches: DbPaymentBatch[];
  workflowDefinitions: DbWorkflowDefinition[];
  workflowRuns: DbWorkflowRun[];
  automationControl: DbAutomationControl | null;
  newRecipientReviews: DbNewRecipientReview[];
  emergencyEvents: DbEmergencyEvent[];

  createPaymentSchedule: (agentDeploymentId: string, params: ScheduleFormParams) => DbPaymentSchedule;
  updatePaymentSchedule: (id: string, params: Partial<ScheduleFormParams>, changeReason?: string) => DbPaymentSchedule;
  getScheduleVersionHistory: (scheduleId: string) => DbScheduleVersion[];
  pausePaymentSchedule: (id: string) => DbPaymentSchedule;
  resumePaymentSchedule: (id: string) => DbPaymentSchedule;
  cancelPaymentSchedule: (id: string) => DbPaymentSchedule;
  initiateManualOccurrence: (occurrenceId: string) => DbScheduleOccurrence;
  retryBlockedOccurrence: (occurrenceId: string) => DbScheduleOccurrence;
  runSchedulerNow: () => void;

  createTreasuryBudget: (name: string, asset: string, limit: number, period: BudgetPeriod, policyId: string | null) => DbBudget;
  pauseTreasuryBudget: (id: string) => DbBudget;
  resumeTreasuryBudget: (id: string) => DbBudget;

  createTreasuryPaymentRequest: (agentDeploymentId: string, recipientAddress: string, asset: string, amount: number, reason: string, recipientLabel?: string) => DbPaymentRequest;
  approveTreasuryPaymentRequest: (id: string) => DbPaymentRequest;
  rejectTreasuryPaymentRequest: (id: string) => DbPaymentRequest;

  createPaymentBatch: (agentDeploymentId: string, name: string, items: BatchItemInput[], budgetIds?: string[], mode?: "INDEPENDENT" | "ATOMIC") => DbPaymentBatch;
  cancelPaymentBatch: (id: string) => DbPaymentBatch;

  createVendorWorkflow: (name?: string) => DbWorkflowDefinition;
  startVendorWorkflowRun: (
    workflowId: string,
    agentDeploymentId: string,
    intent: { recipient: string; asset: string; amount: number; reason: string },
    budgetIds?: string[],
  ) => DbWorkflowRun;
  approveWorkflowRunStep: (runId: string) => DbWorkflowRun;
  rejectWorkflowRunAction: (runId: string, reason?: string) => DbWorkflowRun;

  approveNewRecipient: (reviewId: string, label: string) => DbNewRecipientReview;
  rejectNewRecipient: (reviewId: string) => DbNewRecipientReview;

  authorizePendingExecution: (requestId: string) => Promise<{ status: "success" | "failed"; txHash: string; bucket: string; error?: string }>;
  approvePendingExecution: (requestId: string) => void;
  rejectPendingExecution: (requestId: string) => void;

  pauseAllTreasuryAutomation: (reason?: string) => DbAutomationControl;
  resumeTreasuryAutomation: () => DbAutomationControl;
  updateTreasuryEmergencyRules: (
    updates: Partial<Pick<DbAutomationControl, "maxDailyTreasurySpend" | "maxBatchSize" | "maxRecipients" | "requireNewRecipientApproval" | "emergencyPauseThreshold" | "maxFailureRate" | "failureRateWindow">>,
  ) => DbAutomationControl;
}

interface ScheduleFormParams {
  asset: string;
  recipient: string;
  amount: number;
  reason: string;
  frequency: ScheduleFrequency;
  customIntervalDays?: number;
  startDate: number;
  endDate?: number;
  maxOccurrences?: number;
  approvalMode: ApprovalMode;
  budgetIds?: string[];
}

const Ctx = createContext<Store | null>(null);

function initialTheme(): Theme {
  try {
    const s = localStorage.getItem("holographic:theme");
    if (s === "dark" || s === "light") return s;
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
  } catch {}
  return "dark";
}

function defaultAgentPolicy(agentId: string, owner: string): AgentPolicy {
  return makePolicy({
    agentId,
    owner,
    allowedAssets: ["USDC", "STRK", "ETH"],
    maximumTransactionAmount: 500 * 1_000_000,
    dailySpendingLimit: 5000 * 1_000_000,
    approvedRecipients: [],
    approvalThreshold: 250 * 1_000_000,
    allowedActions: ["payment", "transfer"],
    paused: false,
  });
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const {
    wallet,
    connect,
    connectReal,
    connectReady,
    connectWalletConnect,
    connectMock,
    disconnect: walletDisconnect,
    diagnostic,
    error,
    errorDetails,
    adapter,
  } = useWallet();

  const [agents] = useState<Agent[]>(MOCK_AGENTS);
  const [positions] = useState<TreasuryPosition[]>(MOCK_POSITIONS);
  const [policies, setPolicies] = useState<PolicyRecord[]>(MOCK_POLICIES);
  const [receipts, setReceipts] = useState<ExecutionReceiptData[]>(MOCK_RECEIPTS);
  const [bindingState, setBindingState] = useState<Record<string, BindingState>>(() =>
    Object.fromEntries(
      MOCK_AGENTS.map((a) => [
        a.id,
        { dailySpentUsd: 0, lastActionAt: Date.now() - 3_600_000, paused: a.runtime === "paused" },
      ]),
    ),
  );

  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [dbWallet, setDbWallet] = useState<DbWallet | null>(null);
  const [deployments, setDeployments] = useState<DbAgentDeployment[]>([]);
  const [dbPolicies, setDbPolicies] = useState<DbPolicy[]>([]);
  const [recipients, setRecipients] = useState<DbApprovedRecipient[]>([]);
  const [executionRequests, setExecutionRequests] = useState<DbExecutionRequest[]>([]);
  const [dbReceipts, setDbReceipts] = useState<DbExecutionReceipt[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<DbExecutionRequest[]>([]);
  const [dbAgents, setDbAgents] = useState<DbAgent[]>([]);
  const [agentVersions, setAgentVersions] = useState<DbAgentVersion[]>([]);
  const [notifications, setNotifications] = useState<DbNotification[]>([]);
  const [agentMetrics, setAgentMetrics] = useState<DbAgentMetrics[]>([]);

  const [schedules, setSchedules] = useState<DbPaymentSchedule[]>([]);
  const [scheduleOccurrences, setScheduleOccurrences] = useState<DbScheduleOccurrence[]>([]);
  const [budgets, setBudgets] = useState<DbBudget[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<DbPaymentRequest[]>([]);
  const [batches, setBatches] = useState<DbPaymentBatch[]>([]);
  const [workflowDefinitions, setWorkflowDefinitions] = useState<DbWorkflowDefinition[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<DbWorkflowRun[]>([]);
  const [automationControl, setAutomationControl] = useState<DbAutomationControl | null>(null);
  const [newRecipientReviews, setNewRecipientReviews] = useState<DbNewRecipientReview[]>([]);
  const [emergencyEvents, setEmergencyEvents] = useState<DbEmergencyEvent[]>([]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("holographic:theme", theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    try {
      const seeded = seedAgents();
      setDbAgents(seeded);
    } catch {}
  }, []);

  const refreshFromDb = useCallback(() => {
    try {
      if (!db.isAvailable()) return;
      if (!dbUser) {
        setDeployments([]);
        setDbPolicies([]);
        setRecipients([]);
        setExecutionRequests([]);
        setDbReceipts([]);
        setPendingApprovals([]);
        setAgentVersions([]);
        setNotifications([]);
        setAgentMetrics([]);
        setSchedules([]);
        setScheduleOccurrences([]);
        setBudgets([]);
        setPaymentRequests([]);
        setBatches([]);
        setWorkflowDefinitions([]);
        setWorkflowRuns([]);
        setAutomationControl(null);
        setNewRecipientReviews([]);
        setEmergencyEvents([]);
        return;
      }
      setDeployments(getDeploymentsByUser(dbUser.id));
      setDbPolicies(getPoliciesByUser(dbUser.id));
      setRecipients(getRecipientsByUser(dbUser.id));
      setExecutionRequests(getExecutionRequestsByUser(dbUser.id));
      setDbReceipts(getReceiptsByUser(dbUser.id));
      setPendingApprovals(getPendingApprovalsByUser(dbUser.id));
      setDbAgents(getAllAgents());
      setAgentVersions(db.getAll<DbAgentVersion>("agent_versions"));
      setNotifications(db.getAll<DbNotification>("notifications").filter((n: any) => n.userId === dbUser.id).sort((a: any, b: any) => b.createdAt - a.createdAt));
      setAgentMetrics(db.getAll<DbAgentMetrics>("agent_metrics"));
      setSchedules(getSchedulesByUser(dbUser.id));
      setScheduleOccurrences(getOccurrencesByUser(dbUser.id));
      setBudgets(getBudgetsByUser(dbUser.id));
      setPaymentRequests(getPaymentRequestsByUser(dbUser.id));
      setBatches(getBatchesByUser(dbUser.id));
      setWorkflowDefinitions(getWorkflowDefinitionsByUser(dbUser.id));
      setWorkflowRuns(getRunsByUser(dbUser.id));
      setAutomationControl(getAutomationControl(dbUser.id));
      setNewRecipientReviews(getNewRecipientReviewsByUser(dbUser.id));
      setEmergencyEvents(getEmergencyEvents(dbUser.id));
    } catch (e) {
      console.error("[Store] Failed to refresh from DB", e);
    }
  }, [dbUser]);

  useEffect(() => {
    if (wallet.status !== "connected" || !wallet.address) {
      setDbUser(null);
      setDbWallet(null);
      setDeployments([]);
      setDbPolicies([]);
      setRecipients([]);
      setExecutionRequests([]);
      setDbReceipts([]);
      setPendingApprovals([]);
      return;
    }

    try {
      const user = ensureUser(wallet.address);
      setDbUser(user);
      const activeWallet = ensureWallet(
        user.id,
        wallet.address,
        wallet.chainId,
        wallet.walletName,
        !!diagnostic.isMock,
        (diagnostic.adapterKind as any) ?? "mock",
      );
      setDbWallet(activeWallet);
      setTimeout(() => {
        setDeployments(getDeploymentsByUser(user.id));
        setDbPolicies(getPoliciesByUser(user.id));
        setRecipients(getRecipientsByUser(user.id));
        setExecutionRequests(getExecutionRequestsByUser(user.id));
        setDbReceipts(getReceiptsByUser(user.id));
        setPendingApprovals(getPendingApprovalsByUser(user.id));
        setDbAgents(getAllAgents());
        setAgentVersions(db.getAll<DbAgentVersion>("agent_versions"));
        setNotifications(db.getAll<DbNotification>("notifications").filter((n: any) => n.userId === user.id).sort((a: any, b: any) => b.createdAt - a.createdAt));
        setAgentMetrics(db.getAll<DbAgentMetrics>("agent_metrics"));
        setSchedules(getSchedulesByUser(user.id));
        setScheduleOccurrences(getOccurrencesByUser(user.id));
        setBudgets(getBudgetsByUser(user.id));
        setPaymentRequests(getPaymentRequestsByUser(user.id));
        setBatches(getBatchesByUser(user.id));
        setWorkflowDefinitions(getWorkflowDefinitionsByUser(user.id));
        setWorkflowRuns(getRunsByUser(user.id));
        setAutomationControl(getAutomationControl(user.id));
        setNewRecipientReviews(getNewRecipientReviewsByUser(user.id));
        setEmergencyEvents(getEmergencyEvents(user.id));
      }, 100);
    } catch (e) {
      console.error("[Store] Failed to ensure user/wallet in DB", e);
    }
  }, [wallet.status, wallet.address, wallet.chainId, wallet.walletName, diagnostic.isMock, diagnostic.adapterKind]);

  const policyFor = useCallback(
    (agentId: string) => {
      const active = policies.find((p) => p.agentId === agentId && p.status === "active");
      if (active) return active.doc;
      const agent = agents.find((a) => a.id === agentId);
      return agent ? legacyDefaultPolicy(agent) : legacyDefaultPolicy(MOCK_AGENTS[0]);
    },
    [policies, agents],
  );

  const savePolicy = useCallback((agentId: string, doc: PolicyDocument, label?: string) => {
    setPolicies((prev) => {
      const next = prev.map((p) =>
        p.agentId === agentId && p.status === "active" ? { ...p, status: "superseded" as const } : p,
      );
      const version = doc.version + 1;
      const newDoc = { ...doc, version };
      return [
        {
          id: `pol_${agentId}_v${version}_${Date.now()}`,
          agentId,
          label: label ?? prev.find((p) => p.agentId === agentId)?.label ?? "Custom policy",
          doc: newDoc,
          docHash: poseidonish(newDoc) as any,
          createdAt: Date.now(),
          status: "active" as const,
        },
        ...next,
      ];
    });
  }, []);

  const addReceipt = useCallback((r: ExecutionReceiptData) => {
    setReceipts((prev) => [r, ...prev]);
  }, []);

  const recordExecution = useCallback((agentId: string, amountUsd: number) => {
    setBindingState((prev) => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        dailySpentUsd: (prev[agentId]?.dailySpentUsd ?? 0) + amountUsd,
        lastActionAt: Date.now(),
      },
    }));
  }, []);

  const setAgentRuntime = useCallback((agentId: string, runtime: Agent["runtime"]) => {
    setBindingState((prev) => ({
      ...prev,
      [agentId]: { ...prev[agentId], paused: runtime === "paused" },
    }));
  }, []);

  const pauseAgentDeployment = useCallback(
    (deploymentId: string) => {
      if (!dbUser) throw new Error("User not connected");
      const result = pauseDeployment(deploymentId, dbUser.id);
      // Notification
      try {
        db.create("notifications", {
          userId: dbUser.id,
          type: "agent_paused",
          title: `Agent paused: ${deploymentId}`,
          message: `Deployment ${deploymentId} paused — no new execution permitted`,
          read: false,
          relatedId: deploymentId,
          createdAt: Date.now(),
        });
      } catch {}
      refreshFromDb();
      return result;
    },
    [dbUser, refreshFromDb],
  );

  const resumeAgentDeployment = useCallback(
    (deploymentId: string) => {
      if (!dbUser) throw new Error("User not connected");
      const result = resumeDeployment(deploymentId, dbUser.id);
      try {
        db.create("notifications", {
          userId: dbUser.id,
          type: "agent_activated",
          title: `Agent resumed: ${deploymentId}`,
          message: `Deployment ${deploymentId} resumed — normal operation restored`,
          read: false,
          relatedId: deploymentId,
          createdAt: Date.now(),
        });
      } catch {}
      refreshFromDb();
      return result;
    },
    [dbUser, refreshFromDb],
  );

  const decommissionAgentDeployment = useCallback(
    (deploymentId: string) => {
      if (!dbUser) throw new Error("User not connected");
      const result = disableDeployment(deploymentId, dbUser.id);
      try {
        db.create("notifications", {
          userId: dbUser.id,
          type: "agent_paused",
          title: `Agent decommissioned: ${deploymentId}`,
          message: `Deployment ${deploymentId} decommissioned — no new executions, historical preserved`,
          read: false,
          relatedId: deploymentId,
          createdAt: Date.now(),
        });
      } catch {}
      refreshFromDb();
      return result;
    },
    [dbUser, refreshFromDb],
  );

  const deployTreasuryAgent = useCallback(
    (policy?: AgentPolicy, label?: string) => {
      if (!dbUser || !dbWallet) throw new Error("Wallet not connected — cannot deploy agent");
      try {
        const agentId = "holographic-treasury";
        const agentVersion = "1.0.0";
        const effectivePolicy = policy ?? defaultAgentPolicy(agentId, dbUser.address);
        const result = apiDeployAgent(dbUser.id, dbWallet.id, agentId, agentVersion, effectivePolicy, label ?? "Treasury policy — $500 auto, $500-2000 approval, >$2000 blocked");
        try {
          db.create("notifications", {
            userId: dbUser.id,
            type: "agent_deployed",
            title: `Agent deployed: ${agentId}`,
            message: `Treasury Agent ${agentId} v${agentVersion} deployed — owner ${dbUser.address.slice(0, 10)}...`,
            read: false,
            relatedId: result.deployment.id,
            createdAt: Date.now(),
          });
        } catch {}
        refreshFromDb();
        return result;
      } catch (e) {
        console.error("[Store] Deploy failed", e);
        throw e;
      }
    },
    [dbUser, dbWallet, refreshFromDb],
  );

  const deployAgent = useCallback(
    (agentId: string, policy?: AgentPolicy, label?: string) => {
      if (!dbUser || !dbWallet) throw new Error("Wallet not connected — cannot deploy agent");
      try {
        const dbAgent = db.getById<DbAgent>("agents", agentId);
        const agentVersion = dbAgent?.version ?? "1.0.0";
        const effectivePolicy = policy ?? defaultAgentPolicy(agentId, dbUser.address);
        const result = apiDeployAgent(dbUser.id, dbWallet.id, agentId, agentVersion, effectivePolicy, label ?? `${agentId} policy`);
        try {
          db.create("notifications", {
            userId: dbUser.id,
            type: "agent_deployed",
            title: `Agent deployed: ${agentId}`,
            message: `Agent ${agentId} v${agentVersion} deployed`,
            read: false,
            relatedId: result.deployment.id,
            createdAt: Date.now(),
          });
        } catch {}
        refreshFromDb();
        return result;
      } catch (e) {
        console.error("[Store] Deploy failed", e);
        throw e;
      }
    },
    [dbUser, dbWallet, refreshFromDb],
  );

  const addApprovedRecipient = useCallback(
    (policyId: string, name: string, address: string, asset: string) => {
      if (!dbUser) throw new Error("User not connected");
      try {
        const rec = apiAddRecipient(dbUser.id, policyId, name, address, asset);
        refreshFromDb();
        return rec;
      } catch (e) {
        console.error("[Store] Add recipient failed", e);
        throw e;
      }
    },
    [dbUser, refreshFromDb],
  );

  const removeApprovedRecipient = useCallback(
    (id: string) => {
      try {
        const ok = removeRecipient(id);
        refreshFromDb();
        return ok;
      } catch {
        return false;
      }
    },
    [refreshFromDb],
  );

  const toggleRecipient = useCallback(
    (id: string, active: boolean) => {
      try {
        const rec = active ? enableRecipient(id) : disableRecipient(id);
        refreshFromDb();
        return rec;
      } catch {
        return null;
      }
    },
    [refreshFromDb],
  );

  const markNotificationRead = useCallback((id: string) => {
    try {
      db.update("notifications", id, { read: true });
      refreshFromDb();
    } catch {}
  }, [refreshFromDb]);

  /**
   * Worker-boundary simulation: this interval stands in for a real
   * scheduler/cron process. It never signs anything — it only advances due
   * schedules to READY/AWAITING_USER for the connected wallet to authorize.
   * See src/lib/scheduler/worker.ts for the documented boundary.
   */
  const diagnosticRef = useRef(diagnostic);
  diagnosticRef.current = diagnostic;

  useEffect(() => {
    if (!dbUser) return;
    const tick = () => {
      try {
        const d = diagnosticRef.current;
        runSchedulerTick(dbUser.id, Date.now(), { strk20ProviderDown: !d.isMock && !!d.error });
        refreshFromDb();
      } catch (e) {
        console.error("[Store] Scheduler tick failed", e);
      }
    };
    tick();
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, [dbUser, refreshFromDb]);

  const createPaymentSchedule = useCallback(
    (agentDeploymentId: string, params: Parameters<Store["createPaymentSchedule"]>[1]) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const schedule = createSchedule(dbUser.id, agentDeploymentId, params);
      refreshFromDb();
      return schedule;
    },
    [dbUser, refreshFromDb],
  );

  const updatePaymentSchedule = useCallback(
    (id: string, params: Partial<ScheduleFormParams>, changeReason?: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const schedule = updateSchedule(id, dbUser.id, params, changeReason);
      refreshFromDb();
      return schedule;
    },
    [dbUser, refreshFromDb],
  );

  const getScheduleVersionHistory = useCallback((scheduleId: string) => getScheduleVersions(scheduleId), []);

  const pausePaymentSchedule = useCallback(
    (id: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const s = pauseSchedule(id, dbUser.id);
      refreshFromDb();
      return s;
    },
    [dbUser, refreshFromDb],
  );

  const resumePaymentSchedule = useCallback(
    (id: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const s = resumeSchedule(id, dbUser.id);
      refreshFromDb();
      return s;
    },
    [dbUser, refreshFromDb],
  );

  const cancelPaymentSchedule = useCallback(
    (id: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const s = cancelSchedule(id, dbUser.id);
      refreshFromDb();
      return s;
    },
    [dbUser, refreshFromDb],
  );

  const initiateManualOccurrence = useCallback(
    (occurrenceId: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const o = proposeManualOccurrence(occurrenceId, dbUser.id);
      refreshFromDb();
      return o;
    },
    [dbUser, refreshFromDb],
  );

  const retryBlockedOccurrence = useCallback(
    (occurrenceId: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const o = retryOccurrence(occurrenceId, dbUser.id);
      refreshFromDb();
      return o;
    },
    [dbUser, refreshFromDb],
  );

  const runSchedulerNow = useCallback(() => {
    if (!dbUser) return;
    runSchedulerTick(dbUser.id);
    refreshFromDb();
  }, [dbUser, refreshFromDb]);

  const createTreasuryBudget = useCallback(
    (name: string, asset: string, limit: number, period: BudgetPeriod, policyId: string | null) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const b = createBudget(dbUser.id, name, asset, limit, period, policyId);
      refreshFromDb();
      return b;
    },
    [dbUser, refreshFromDb],
  );

  const pauseTreasuryBudget = useCallback(
    (id: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const b = pauseBudget(id, dbUser.id)!;
      refreshFromDb();
      return b;
    },
    [dbUser, refreshFromDb],
  );

  const resumeTreasuryBudget = useCallback(
    (id: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const b = resumeBudget(id, dbUser.id)!;
      refreshFromDb();
      return b;
    },
    [dbUser, refreshFromDb],
  );

  const createTreasuryPaymentRequest = useCallback(
    (agentDeploymentId: string, recipientAddress: string, asset: string, amount: number, reason: string, recipientLabel?: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const r = createPaymentRequest(dbUser.id, agentDeploymentId, recipientAddress, asset, amount, reason, recipientLabel);
      refreshFromDb();
      return r;
    },
    [dbUser, refreshFromDb],
  );

  const approveTreasuryPaymentRequest = useCallback(
    (id: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const r = approvePaymentRequest(id, dbUser.id);
      refreshFromDb();
      return r;
    },
    [dbUser, refreshFromDb],
  );

  const rejectTreasuryPaymentRequest = useCallback(
    (id: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const r = rejectPaymentRequest(id, dbUser.id);
      refreshFromDb();
      return r;
    },
    [dbUser, refreshFromDb],
  );

  const createPaymentBatch = useCallback(
    (agentDeploymentId: string, name: string, items: BatchItemInput[], budgetIds: string[] = [], mode: "INDEPENDENT" | "ATOMIC" = "INDEPENDENT") => {
      if (!dbUser) throw new Error("Wallet not connected");
      const b = createBatch(dbUser.id, agentDeploymentId, name, items, budgetIds, mode);
      refreshFromDb();
      return b;
    },
    [dbUser, refreshFromDb],
  );

  const cancelPaymentBatch = useCallback(
    (id: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const b = cancelBatch(id, dbUser.id);
      refreshFromDb();
      return b;
    },
    [dbUser, refreshFromDb],
  );

  const createVendorWorkflow = useCallback(
    (name?: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const w = createWorkflowDefinition(dbUser.id, name ?? "Vendor Payment Workflow");
      refreshFromDb();
      return w;
    },
    [dbUser, refreshFromDb],
  );

  const startVendorWorkflowRun = useCallback(
    (workflowId: string, agentDeploymentId: string, intent: { recipient: string; asset: string; amount: number; reason: string }, budgetIds: string[] = []) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const run = startWorkflowRun(dbUser.id, workflowId, agentDeploymentId, intent, budgetIds);
      refreshFromDb();
      return run;
    },
    [dbUser, refreshFromDb],
  );

  const approveWorkflowRunStep = useCallback(
    (runId: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const run = approveWorkflowStep(runId, dbUser.id);
      refreshFromDb();
      return run;
    },
    [dbUser, refreshFromDb],
  );

  const rejectWorkflowRunAction = useCallback(
    (runId: string, reason?: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const run = rejectWorkflowRun(runId, dbUser.id, reason);
      refreshFromDb();
      return run;
    },
    [dbUser, refreshFromDb],
  );

  const approveNewRecipient = useCallback(
    (reviewId: string, label: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const r = approveNewRecipientReview(reviewId, dbUser.id, label);
      refreshFromDb();
      return r;
    },
    [dbUser, refreshFromDb],
  );

  const rejectNewRecipient = useCallback(
    (reviewId: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const r = rejectNewRecipientReview(reviewId, dbUser.id);
      refreshFromDb();
      return r;
    },
    [dbUser, refreshFromDb],
  );

  const authorizePendingExecution = useCallback(
    async (requestId: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const result = await authorizeExecutionRequest(requestId, dbUser.id, !!diagnostic.isMock);
      refreshFromDb();
      return result;
    },
    [dbUser, diagnostic.isMock, refreshFromDb],
  );

  const approvePendingExecution = useCallback(
    (requestId: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      approveExecutionRequest(requestId, dbUser.id);
      refreshFromDb();
    },
    [dbUser, refreshFromDb],
  );

  const rejectPendingExecution = useCallback(
    (requestId: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      rejectExecutionRequest(requestId, dbUser.id);
      refreshFromDb();
    },
    [dbUser, refreshFromDb],
  );

  const pauseAllTreasuryAutomation = useCallback(
    (reason?: string) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const c = pauseAllAutomation(dbUser.id, reason);
      refreshFromDb();
      return c;
    },
    [dbUser, refreshFromDb],
  );

  const resumeTreasuryAutomation = useCallback(() => {
    if (!dbUser) throw new Error("Wallet not connected");
    const c = resumeAutomation(dbUser.id);
    refreshFromDb();
    return c;
  }, [dbUser, refreshFromDb]);

  const updateTreasuryEmergencyRules = useCallback(
    (updates: Parameters<Store["updateTreasuryEmergencyRules"]>[0]) => {
      if (!dbUser) throw new Error("Wallet not connected");
      const c = updateEmergencyRules(dbUser.id, updates);
      refreshFromDb();
      return c;
    },
    [dbUser, refreshFromDb],
  );

  const disconnect = useCallback(async () => {
    try {
      if (dbUser) disconnectWalletsByUser(dbUser.id);
    } catch {}
    await walletDisconnect();
    setDbUser(null);
    setDbWallet(null);
    setDeployments([]);
    setDbPolicies([]);
    setRecipients([]);
    setExecutionRequests([]);
    setDbReceipts([]);
    setPendingApprovals([]);
    setSchedules([]);
    setScheduleOccurrences([]);
    setBudgets([]);
    setPaymentRequests([]);
    setBatches([]);
    setWorkflowDefinitions([]);
    setWorkflowRuns([]);
    setAutomationControl(null);
    setNewRecipientReviews([]);
    setEmergencyEvents([]);
  }, [dbUser, walletDisconnect]);

  const value = useMemo<Store>(
    () => ({
      theme,
      toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
      wallet,
      connect: () => connect(),
      connectReal: () => connectReal(),
      connectReady: () => connectReady(),
      connectWalletConnect: () => connectWalletConnect(),
      connectMock: () => connectMock(),
      diagnostic,
      walletError: error,
      errorDetails,
      adapter,
      disconnect,
      agents,
      dbAgents,
      positions,
      policies,
      receipts,
      bindingState,
      policyFor,
      savePolicy,
      addReceipt,
      recordExecution,
      setAgentRuntime,
      pauseAgentDeployment,
      resumeAgentDeployment,
      decommissionAgentDeployment: decommissionAgentDeployment,
      dbUser,
      dbWallet,
      deployments,
      dbPolicies,
      recipients,
      executionRequests,
      dbReceipts,
      pendingApprovals,
      agentVersions,
      notifications,
      agentMetrics,
      deployTreasuryAgent,
      deployAgent,
      addApprovedRecipient,
      removeApprovedRecipient,
      toggleRecipient,
      refreshFromDb,
      markNotificationRead,
      schedules,
      scheduleOccurrences,
      budgets,
      paymentRequests,
      batches,
      workflowDefinitions,
      workflowRuns,
      automationControl,
      newRecipientReviews,
      emergencyEvents,
      createPaymentSchedule,
      updatePaymentSchedule,
      getScheduleVersionHistory,
      pausePaymentSchedule,
      resumePaymentSchedule,
      cancelPaymentSchedule,
      initiateManualOccurrence,
      retryBlockedOccurrence,
      runSchedulerNow,
      createTreasuryBudget,
      pauseTreasuryBudget,
      resumeTreasuryBudget,
      createTreasuryPaymentRequest,
      approveTreasuryPaymentRequest,
      rejectTreasuryPaymentRequest,
      createPaymentBatch,
      cancelPaymentBatch,
      createVendorWorkflow,
      startVendorWorkflowRun,
      approveWorkflowRunStep,
      rejectWorkflowRunAction,
      approveNewRecipient,
      rejectNewRecipient,
      authorizePendingExecution,
      approvePendingExecution,
      rejectPendingExecution,
      pauseAllTreasuryAutomation,
      resumeTreasuryAutomation,
      updateTreasuryEmergencyRules,
    }),
    [
      theme,
      wallet,
      connect,
      connectReal,
      connectReady,
      connectWalletConnect,
      connectMock,
      diagnostic,
      error,
      errorDetails,
      adapter,
      disconnect,
      agents,
      dbAgents,
      positions,
      policies,
      receipts,
      bindingState,
      policyFor,
      savePolicy,
      addReceipt,
      recordExecution,
      setAgentRuntime,
      pauseAgentDeployment,
      resumeAgentDeployment,
      decommissionAgentDeployment,
      dbUser,
      dbWallet,
      deployments,
      dbPolicies,
      recipients,
      executionRequests,
      dbReceipts,
      pendingApprovals,
      agentVersions,
      notifications,
      agentMetrics,
      deployTreasuryAgent,
      deployAgent,
      addApprovedRecipient,
      removeApprovedRecipient,
      toggleRecipient,
      refreshFromDb,
      markNotificationRead,
      schedules,
      scheduleOccurrences,
      budgets,
      paymentRequests,
      batches,
      workflowDefinitions,
      workflowRuns,
      automationControl,
      newRecipientReviews,
      emergencyEvents,
      createPaymentSchedule,
      updatePaymentSchedule,
      getScheduleVersionHistory,
      pausePaymentSchedule,
      resumePaymentSchedule,
      cancelPaymentSchedule,
      initiateManualOccurrence,
      retryBlockedOccurrence,
      runSchedulerNow,
      createTreasuryBudget,
      pauseTreasuryBudget,
      resumeTreasuryBudget,
      createTreasuryPaymentRequest,
      approveTreasuryPaymentRequest,
      rejectTreasuryPaymentRequest,
      createPaymentBatch,
      cancelPaymentBatch,
      createVendorWorkflow,
      startVendorWorkflowRun,
      approveWorkflowRunStep,
      rejectWorkflowRunAction,
      approveNewRecipient,
      rejectNewRecipient,
      authorizePendingExecution,
      approvePendingExecution,
      rejectPendingExecution,
      pauseAllTreasuryAutomation,
      resumeTreasuryAutomation,
      updateTreasuryEmergencyRules,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
