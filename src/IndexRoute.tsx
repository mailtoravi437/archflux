import { Navigate } from 'react-router-dom';
import { getSession } from './session';

/** Entry decision: signed-in/guest users land in the library, everyone else at login. */
export function IndexRoute() {
  return <Navigate to={getSession() ? '/dashboard' : '/login'} replace />;
}