import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/** Keeps a rendering bug in one part of the panel from blanking the whole panel. */
export default class ErrorBoundary extends Component<{ children: ReactNode; onReset?: () => void }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        <p className="font-semibold">Something went wrong showing this view.</p>
        <p className="mt-1 font-mono text-xs">{this.state.error.message}</p>
        <button
          type="button"
          className="mt-2 rounded bg-red-600 px-2 py-1 text-xs text-white"
          onClick={() => {
            this.setState({ error: null });
            this.props.onReset?.();
          }}
        >
          Try again
        </button>
      </div>
    );
  }
}
