import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { getSession } from './session';

/** Lightweight auth gate — guest sessions count, no network involved. */
export function RequireSession({ children }: { children: ReactNode }) {
  if (!getSession()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}