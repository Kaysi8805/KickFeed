import { Component, type ErrorInfo, type ReactNode } from 'react';

import { EmptyState } from '@/components/ui/EmptyState';

type Props = {
  title: string;
  body: string;
  children: ReactNode;
};

type State = { failed: boolean };

/** Renders an empty state instead of a white screen when a child throws. */
export class SafeBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    /* Empty state is the user-facing result. */
  }

  render() {
    if (this.state.failed) {
      return <EmptyState compact title={this.props.title} body={this.props.body} />;
    }
    return this.props.children;
  }
}
