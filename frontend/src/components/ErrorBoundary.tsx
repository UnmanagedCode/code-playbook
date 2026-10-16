import { Component, type ReactNode } from 'react';

/**
 * Renders `fallback(error)` in place of a subtree that threw while rendering (a detail cc sent in a shape the
 * viewer cannot draw), so the rest of the page keeps working. A new `resetKey` (the next navigation, another
 * detail) clears the error and renders the children again.
 */
export class ErrorBoundary extends Component<{ resetKey: unknown; fallback: (error: Error) => ReactNode; children: ReactNode }, { error: Error | null; key: unknown }> {
  state: { error: Error | null; key: unknown } = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: { resetKey: unknown }, state: { error: Error | null; key: unknown }) {
    return props.resetKey === state.key ? null : { error: null, key: props.resetKey };
  }

  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}
