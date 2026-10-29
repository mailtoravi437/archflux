import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import './styles.css';
import { DiagramProvider } from './state/store';
import ErrorBoundary from './components/ErrorBoundary';
import router from './App';
import { loadRuntimeConfig } from './lib/config';

// Apply the persisted theme before first paint to avoid a light→dark flash.
try {
  const raw = localStorage.getItem('archflux:v2-light');
  const theme = raw && (JSON.parse(raw).theme as string);
  document.documentElement.setAttribute(
    'data-theme',
    theme === 'dark' || theme === 'blueprint' || theme === 'light' ? theme : 'light',
  );
} catch {
  document.documentElement.setAttribute('data-theme', 'light');
}

// Resolve apiUrl/wsUrl from /config.json before any request (SERVICES_SPEC §3.1).
void loadRuntimeConfig().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <DiagramProvider>
          <RouterProvider router={router} />
        </DiagramProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
});
