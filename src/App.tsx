import { RouterProvider, useRoute } from "./app/router";
import AppShell from "./app/layout";
import { StoreProvider } from "./lib/store";
import { ErrorBoundary } from "./components/ErrorBoundary";
import OverviewPage from "./app/page";
import AgentsPage from "./app/agents/page";
import AgentDetailPage from "./app/agents/[id]/page";
import TreasuryPage from "./app/treasury/page";
import SchedulesPage from "./app/treasury/schedules/page";
import BudgetsPage from "./app/treasury/budgets/page";
import PaymentsPage from "./app/treasury/payments/page";
import WorkflowsPage from "./app/treasury/workflows/page";
import PaymentRequestsPage from "./app/treasury/payment-requests/page";
import AutomationSettingsPage from "./app/settings/automation/page";
import ActivityPage from "./app/activity/page";
import PoliciesPage from "./app/policies/page";
import CompliancePage from "./app/compliance/page";
import AuditsPage from "./app/compliance/audits/page";
import VerificationPage from "./app/verification/page";
import CreatorPage from "./app/creator/page";
import CreatorAgentsPage from "./app/creator/agents/page";
import CreatorSubmissionsPage from "./app/creator/submissions/page";
import CreatorMetricsPage from "./app/creator/metrics/page";
import SettingsPage from "./app/settings/page";

function Routes() {
  const { pattern } = useRoute();
  switch (pattern) {
    case "/agents":
      return <AgentsPage />;
    case "/agents/[id]":
      return <AgentDetailPage />;
    case "/treasury":
      return <TreasuryPage />;
    case "/treasury/schedules":
      return <SchedulesPage />;
    case "/treasury/budgets":
      return <BudgetsPage />;
    case "/treasury/payments":
      return <PaymentsPage />;
    case "/treasury/workflows":
      return <WorkflowsPage />;
    case "/treasury/payment-requests":
      return <PaymentRequestsPage />;
    case "/settings/automation":
      return <AutomationSettingsPage />;
    case "/activity":
      return <ActivityPage />;
    case "/policies":
      return <PoliciesPage />;
    case "/compliance":
      return <CompliancePage />;
    case "/compliance/audits":
      return <AuditsPage />;
    case "/verification":
      return <VerificationPage />;
    case "/creator":
      return <CreatorPage />;
    case "/creator/agents":
      return <CreatorAgentsPage />;
    case "/creator/submissions":
      return <CreatorSubmissionsPage />;
    case "/creator/metrics":
      return <CreatorMetricsPage />;
    case "/settings":
      return <SettingsPage />;
    default:
      return <OverviewPage />;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <RouterProvider>
        <StoreProvider>
          <ErrorBoundary>
            <AppShell>
              <Routes />
            </AppShell>
          </ErrorBoundary>
        </StoreProvider>
      </RouterProvider>
    </ErrorBoundary>
  );
}
