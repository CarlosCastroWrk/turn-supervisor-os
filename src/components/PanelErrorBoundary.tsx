import { Component, type ErrorInfo, type ReactNode } from 'react';

interface PanelErrorBoundaryProps {
  readonly name: string;
  readonly children: ReactNode;
  readonly onReset?: () => void;
}

interface PanelErrorBoundaryState {
  readonly crashed: boolean;
}

// One field surface hitting a render-time error should NOT white-screen the
// whole app — it strands Los on a job site. This boundary contains the crash
// to the panel, keeps the rest of the app (and his data) alive, and offers a
// "go back" that resets to a safe view. The root boundary is still the last
// line of defense for anything a panel can't catch.
export class PanelErrorBoundary extends Component<PanelErrorBoundaryProps, PanelErrorBoundaryState> {
  state: PanelErrorBoundaryState = { crashed: false };

  static getDerivedStateFromError(): PanelErrorBoundaryState {
    return { crashed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`turn-os-panel-crash:${this.props.name}`, error, info.componentStack);
  }

  private recover = (): void => {
    this.setState({ crashed: false });
    this.props.onReset?.();
  };

  render(): ReactNode {
    if (!this.state.crashed) return this.props.children;
    return (
      <section className="lcc-panel-crash" role="alert">
        <strong>This screen hit a snag.</strong>
        <p>Your Turn is safe — nothing was lost. Go back and try again.</p>
        <button onClick={this.recover} type="button">Go back</button>
      </section>
    );
  }
}
