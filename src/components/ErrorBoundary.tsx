"use client";
import { Component } from "react";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Rendered instead of children when a descendant throws. */
  fallback?: ReactNode;
  /** Re-mount the boundary (and retry children) when this value changes. */
  resetKey?: unknown;
  onError?: (error: Error) => void;
}
interface State { hasError: boolean; }

/* Generic React error boundary. Used to isolate per-slide-element rendering so a
 * single malformed element (bad chart data, non-finite coords, broken LaTeX)
 * renders the fallback instead of taking down the whole slide / deck / app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: Error) {
    console.error("ErrorBoundary caught:", error);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
