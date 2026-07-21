import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerServiceWorker } from '@/app/lib/registerServiceWorker';

const rootElement = document.getElementById('root');

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function renderFatalError(error: unknown) {
  console.error('[App] Startup failed:', error);
  if (!rootElement) {
    return;
  }

  const message = escapeHtml(error instanceof Error ? error.message : 'The app could not start.');
  rootElement.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#2f2f2f;background:#f7f7f7;">
      <div style="max-width:420px;width:100%;border:1px solid #e8e8e8;border-radius:8px;background:#fff;padding:24px;box-shadow:0 4px 18px rgba(0,0,0,.08);">
        <h1 style="margin:0 0 8px;font-size:20px;line-height:1.3;">Unable to start app</h1>
        <p style="margin:0;color:#5a5a5a;font-size:14px;line-height:1.5;">${message}</p>
      </div>
    </div>
  `;
}

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown) {
    console.error('[App] Render failed:', error);
  }

  render() {
    if (this.state.error) {
      const message = this.state.error instanceof Error ? this.state.error.message : 'The app could not render.';
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
          <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
            <h1 className="text-xl font-semibold">Unable to render app</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

window.addEventListener('error', (event) => {
  console.error('[App] Unhandled error:', event.error ?? event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (reason instanceof Error) {
    console.error('[App] Unhandled rejection:', {
      name: reason.name,
      message: reason.message,
      stack: reason.stack,
    });
    return;
  }

  if (reason && typeof reason === 'object') {
    console.error('[App] Unhandled rejection:', JSON.stringify(reason));
    return;
  }

  console.error('[App] Unhandled rejection:', reason);
});

async function bootstrap() {
  if (!rootElement) {
    throw new Error('Missing #root element.');
  }

  rootElement.innerHTML = '<div style="min-height:100vh;background:#f7f7f7;"></div>';
  registerServiceWorker();
  const { default: App } = await import('@/app/app');

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </React.StrictMode>
  );
}

void bootstrap().catch(renderFatalError);
