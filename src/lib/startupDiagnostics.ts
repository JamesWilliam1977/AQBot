export type StartupLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
export type StartupDiagnosticWriter = (
  level: StartupLogLevel,
  message: string,
) => void | Promise<void>;

const MAX_DIAGNOSTIC_TEXT_LENGTH = 8 * 1024;

export function formatStartupError(reason: unknown): string {
  if (reason instanceof Error) {
    return truncateDiagnosticText(reason.stack || reason.message || reason.name);
  }
  if (typeof reason === 'string') {
    return truncateDiagnosticText(reason);
  }
  try {
    return truncateDiagnosticText(JSON.stringify(reason) ?? String(reason));
  } catch {
    return String(reason);
  }
}

export async function writeStartupDiagnostic(
  level: StartupLogLevel,
  message: string,
): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('write_diagnostic_log', {
      level,
      message: truncateDiagnosticText(message),
    });
  } catch {
    // Logging must never break startup.
  }
}

export function installStartupDiagnostics(
  writeLog: StartupDiagnosticWriter = writeStartupDiagnostic,
): () => void {
  const handleError = (event: ErrorEvent) => {
    void writeLog(
      'error',
      [
        'frontend window error',
        `message=${event.message || '<empty>'}`,
        `filename=${event.filename || '<unknown>'}`,
        `line=${event.lineno || 0}`,
        `column=${event.colno || 0}`,
        event.error ? `error=${formatStartupError(event.error)}` : null,
      ].filter(Boolean).join(' '),
    );
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    void writeLog(
      'error',
      `frontend unhandled rejection: ${formatStartupError(event.reason)}`,
    );
  };

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);

  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  };
}

export function renderStartupError(root: HTMLElement, reason: unknown): void {
  const panel = document.createElement('div');
  panel.style.minHeight = '100vh';
  panel.style.boxSizing = 'border-box';
  panel.style.padding = '32px';
  panel.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  panel.style.background = '#111827';
  panel.style.color = '#f9fafb';

  const title = document.createElement('h1');
  title.textContent = 'AQBot startup failed';
  title.style.margin = '0 0 12px';
  title.style.fontSize = '20px';
  title.style.fontWeight = '600';

  const description = document.createElement('p');
  description.textContent = 'Please restart AQBot with AQBOT_LOG_FILE and RUST_LOG=debug, then attach the generated log file.';
  description.style.margin = '0 0 16px';
  description.style.color = '#d1d5db';
  description.style.lineHeight = '1.5';

  const pre = document.createElement('pre');
  pre.textContent = formatStartupError(reason);
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.wordBreak = 'break-word';
  pre.style.padding = '16px';
  pre.style.borderRadius = '8px';
  pre.style.background = '#020617';
  pre.style.color = '#fca5a5';
  pre.style.overflow = 'auto';
  pre.style.maxHeight = '60vh';

  panel.append(title, description, pre);
  root.replaceChildren(panel);
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function truncateDiagnosticText(text: string): string {
  if (text.length <= MAX_DIAGNOSTIC_TEXT_LENGTH) return text;
  return `${text.slice(0, MAX_DIAGNOSTIC_TEXT_LENGTH)}...<truncated>`;
}
