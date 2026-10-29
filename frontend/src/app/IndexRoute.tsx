import { Navigate } from 'react-router-dom';
import { getSession, isSignedIn } from '../state/session';

/** Entry decision: signed-in users land on Home, guests in the library, everyone else at login. */
export function IndexRoute() {
  return <Navigate to={isSignedIn() ? '/home' : getSession() ? '/dashboard' : '/login'} replace />;
}