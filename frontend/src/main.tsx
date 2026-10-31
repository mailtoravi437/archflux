import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import './styles.css';
import { DiagramProvider } from './state/store';
import ErrorBoundary from './components/ErrorBoundary';
import { createAppRouter } from './App';
import { loadRuntimeConfig } from './lib/config';
import { migrateLegacyHash } from './lib/legacyHash';
import { applyStoredTheme } from './state/theme';

// Old `/#/path` links redirect to `/path` before the router reads the URL.
migrateLegacyHash();

// Apply the persisted theme before first paint to avoid a light→dark flash.
applyStoredTheme();

// Resolve apiUrl/wsUrl from /config.json before any request (SERVICES_SPEC §3.1).
void loadRuntimeConfig().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <DiagramProvider>
          <RouterProvider router={createAppRouter()} />
        </DiagramProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
});
