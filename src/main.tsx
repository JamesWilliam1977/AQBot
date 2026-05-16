import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import {
  formatStartupError,
  installStartupDiagnostics,
  renderStartupError,
  writeStartupDiagnostic,
} from '@/lib/startupDiagnostics';

// Native context menu prevention is handled by GlobalCopyMenu component.
// It prevents the native menu while providing a custom Copy menu when text is selected.

installStartupDiagnostics();

async function bootstrap() {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('AQBot root element #root was not found');
  }

  const { default: AppRoot } = await import('./App');
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <AppRoot />
    </React.StrictMode>,
  );
  void writeStartupDiagnostic('info', 'AQBot frontend bootstrap rendered');
}

void bootstrap().catch((error) => {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    renderStartupError(rootElement, error);
  }
  void writeStartupDiagnostic(
    'error',
    `AQBot frontend bootstrap failed: ${formatStartupError(error)}`,
  );
});
