import { useNavigate } from 'react-router-dom';
import { NotFoundState } from '../components/states';

/** Unknown path under the app shell: honest copy, one way home. The index route still redirects. */
export function NotFoundRoute() {
  const navigate = useNavigate();
  return (
    <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <NotFoundState
        page
        onGoHome={() => navigate('/', { replace: true })}
      />
    </main>
  );
}
