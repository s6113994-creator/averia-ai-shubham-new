import { Component, ErrorInfo, ReactNode } from 'react';
import { AveriaLogo } from '@/components/AveriaLogo';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, message: error?.message || 'Workspace render interruption' };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Averia workspace recovery boundary]', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
        <aside className="hidden sm:flex w-[268px] shrink-0 flex-col border-r border-border bg-card">
          <div className="h-14 px-4 flex items-center gap-2 border-b border-border">
            <AveriaLogo size="md" />
            <span className="font-heading text-base font-semibold">Averia AI</span>
          </div>
          <div className="p-3 space-y-2">
            <button onClick={() => window.location.assign('/averia-ai')} className="w-full rounded-lg border border-primary/30 bg-primary/15 px-3 py-2 text-left text-sm font-semibold">
              + New chat
            </button>
            <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-muted-foreground">Search chats</div>
            <div className="rounded-lg px-3 py-2 text-sm text-muted-foreground">Images</div>
          </div>
          <div className="px-4 pt-3 text-[11px] uppercase tracking-wider text-muted-foreground">Other</div>
          <div className="p-3 space-y-1 text-sm text-muted-foreground">
            <button onClick={() => window.location.assign('/chat')} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-secondary/50">User chats</button>
            <button onClick={() => window.location.assign('/news')} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-secondary/50">News</button>
          </div>
          <div className="m-3 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm">
            <div className="font-semibold">Averia 1.0 Axion</div>
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full w-1/5 bg-primary" /></div>
          </div>
        </aside>
        <main className="flex-1 min-w-0 overflow-auto p-5 sm:p-8">
          <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center">
            <div className="mb-6 flex items-center gap-3 sm:hidden">
              <AveriaLogo size="md" />
              <span className="font-heading text-lg font-semibold">Averia AI</span>
            </div>
            <p className="text-sm font-semibold text-primary">Workspace recovery active</p>
            <h1 className="mt-3 font-heading text-3xl font-bold sm:text-5xl">Averia Agentic AI Chatbot</h1>
            <p className="mt-4 max-w-2xl text-muted-foreground">
              The root safety layer preserved the interface while a component recovered from a render interruption.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={() => window.location.assign('/averia-ai')} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                Restore workspace
              </button>
              <button onClick={() => window.location.reload()} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">
                Reload interface
              </button>
            </div>
            {this.state.message && <pre className="mt-5 max-w-2xl whitespace-pre-wrap rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">{this.state.message}</pre>}
          </div>
        </main>
      </div>
    );
  }
}