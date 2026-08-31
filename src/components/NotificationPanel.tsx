import { useStore } from "../lib/store";
import { Panel, PanelHeader, Badge } from "./ui/primitives";
import { Bell, X } from "lucide-react";
import { timeAgo } from "../lib/format";

export default function NotificationPanel() {
  const { notifications, markNotificationRead, dbUser } = useStore();
  const list = dbUser ? notifications.slice(0, 10) : [];

  if (list.length === 0) return null;

  return (
    <Panel padded={false}>
      <PanelHeader title="Notifications" sub={`${list.filter((n) => !n.read).length} unread`} right={<Bell size={12} className="faint" />} />
      <div className="max-h-[300px] overflow-y-auto">
        {list.map((n) => (
          <div key={n.id} className="px-4 py-2.5 border-b last:border-0 flex items-start justify-between gap-2" style={{ borderColor: "var(--border)", opacity: n.read ? 0.6 : 1 }}>
            <div className="min-w-0">
              <div className="text-[12px] font-medium truncate">{n.title}</div>
              <div className="text-[11px] faint truncate">{n.message}</div>
              <div className="mono text-[10px] faint">{timeAgo(n.createdAt)} · {n.type}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!n.read && <Badge tone="warn">new</Badge>}
              <button onClick={() => markNotificationRead(n.id)} className="h-6 w-6 grid place-items-center rounded hover:bg-[var(--track)]">
                <X size={10} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
