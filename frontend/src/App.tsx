import { lazy } from 'react';
import { Navigate, createHashRouter } from 'react-router-dom';
import AppShell from './components/AppShell';
import LoginScreen from './screens/LoginScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import AuthCallbackScreen from './screens/AuthCallbackScreen';
import InviteScreen from './screens/InviteScreen';
import { withFallback } from './app/withFallback';
import { RequireSession } from './app/RequireSession';
import { IndexRoute } from './app/IndexRoute';
import { NotFoundRoute } from './app/NotFoundRoute';

// Route-level code splitting: the canvas editor is the heavy chunk and
// shouldn't block first paint of the shell. Hash routing keeps deep links
// working on plain static hosts (no server rewrites available).
const CanvasScreen = lazy(() => import('./screens/CanvasScreen'));
const LivingScreen = lazy(() => import('./screens/LivingScreen'));
const ReviewsScreen = lazy(() => import('./screens/ReviewsScreen'));
const BlueprintsScreen = lazy(() => import('./screens/BlueprintsScreen'));
const DashboardScreen = lazy(() => import('./screens/DashboardScreen'));
const HomeScreen = lazy(() => import('./screens/HomeScreen'));
const TrashScreen = lazy(() => import('./screens/TrashScreen'));
const AccessStatesScreen = lazy(() => import('./screens/AccessStatesScreen'));
const HistoryScreen = lazy(() => import('./screens/HistoryScreen'));
const SettingsLayout = lazy(() => import('./screens/SettingsLayout'));
const SettingsGeneralScreen = lazy(() => import('./screens/SettingsGeneralScreen'));
const SettingsConnectorsScreen = lazy(() => import('./screens/SettingsConnectorsScreen'));
const SettingsTeamScreen = lazy(() => import('./screens/SettingsTeamScreen'));
const SettingsStorageScreen = lazy(() => import('./screens/SettingsStorageScreen'));

const router = createHashRouter([
  { path: '/login', element: <LoginScreen /> },
  { path: '/onboarding', element: <OnboardingScreen /> },
  { path: '/auth/callback', element: <AuthCallbackScreen /> },
  // Shareable deep link (R1-E07-T06): checks GET /diagrams/:id/access before opening the doc.
  { path: '/d/:id', element: withFallback(<AccessStatesScreen />) },
  { path: '/invite/:token', element: <InviteScreen /> },
  {
    path: '/',
    element: (
      <RequireSession>
        <AppShell />
      </RequireSession>
    ),
    children: [
      { index: true, element: <IndexRoute /> },
      { path: 'dashboard', element: withFallback(<DashboardScreen />) },
      { path: 'home', element: withFallback(<HomeScreen />) },
      { path: 'trash', element: withFallback(<TrashScreen />) },
      { path: 'canvas', element: withFallback(<CanvasScreen />) },
      { path: 'history', element: withFallback(<HistoryScreen />) },
      { path: 'living', element: withFallback(<LivingScreen />) },
      { path: 'reviews', element: withFallback(<ReviewsScreen />) },
      // v2.4: Git & PRs merged into Reviews → Merge & Automation sub-tab.
      { path: 'git', element: <Navigate to="/reviews" replace state={{ tab: 'merge' }} /> },
      { path: 'blueprints', element: withFallback(<BlueprintsScreen />) },
      {
        path: 'settings',
        element: withFallback(<SettingsLayout />),
        children: [
          { index: true, element: <Navigate to="/settings/general" replace /> },
          { path: 'general', element: withFallback(<SettingsGeneralScreen />) },
          { path: 'connectors', element: withFallback(<SettingsConnectorsScreen />) },
          { path: 'team', element: withFallback(<SettingsTeamScreen />) },
          { path: 'storage', element: withFallback(<SettingsStorageScreen />) },
        ],
      },
      // Retired pitch route: old bookmarks land on the canvas.
      { path: 'proposal', element: <Navigate to="/canvas" replace /> },
      { path: '*', element: <NotFoundRoute /> },
    ],
  },
]);

export default router;
