"use client";

import { Component, type ReactNode } from "react";

/**
 * Catches failures while the lazily-loaded WebGL scene is being created
 * (missing chunk after a redeploy, broken WebGL context, driver crash) so the
 * UI can fall back to the 2D plan instead of spinning forever.
 */
export class SceneBoundary extends Component<
  { children: ReactNode; fallback: (retry: () => void) => ReactNode; onError?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[MAISON 3D] falha ao montar a cena", error);
    this.props.onError?.();
  }

  retry = () => this.setState({ failed: false });

  render() {
    if (this.state.failed) return this.props.fallback(this.retry);
    return this.props.children;
  }
}
