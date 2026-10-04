import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import './styles.css';
import { DiagramProvider } from './store';
import ErrorBoundary from './components/ErrorBoundary';
import router from './App';

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <DiagramProvider>
        <RouterProvider router={router} />
      </DiagramProvider>
    </ErrorBoundary>
  </StrictMode>,
);
