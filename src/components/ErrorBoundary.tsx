import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[Holographic] Unhandled render error", error, info);
  }

  render() {
    if (this.state.error) {
      const e = this.state.error;
      return (
        <div className="min-h-screen grid place-items-center p-6" style={{ background: "#07080f", color: "#eceefa" }}>
          <div className="max-w-[620px] w-full rounded-2xl border p-7" style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}>
            <div className="font-mono text-[11px] uppercase tracking-widest opacity-60 mb-3">Holographic — render error</div>
            <div className="font-semibold text-[18px] mb-2">The app crashed while rendering</div>
            <div className="text-[13px] leading-relaxed opacity-70 mb-4">
              This is the blank-screen you saw — the background was painting but React had unmounted after an exception.
              The stack below is from the error boundary.
            </div>
            <pre className="text-[11.5px] leading-relaxed whitespace-pre-wrap break-words rounded-lg p-4 overflow-auto max-h-[40vh]" style={{ background: "rgba(0,0,0,0.5)" }}>
              {e.name}: {e.message}
              {"\n\n"}
              {e.stack}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-5 h-9 px-4 rounded-lg text-[13px] font-medium"
              style={{ background: "#eceefa", color: "#07080f" }}
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
