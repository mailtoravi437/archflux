import { NavLink, Outlet } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

const TABS = [
  { to: '/settings/general', label: 'General' },
  { to: '/settings/connectors', label: 'Connectors' },
  { to: '/settings/team', label: 'Team' },
  { to: '/settings/storage', label: 'Storage' },
];

export default function SettingsLayout() {
  return (
    <div className="screen-view active">
      <div className="screen-content-wrapper" style={{ flexDirection: 'column' }}>
        <PageHeader title="Settings" />
        <nav style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} aria-label="Settings sections">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => `btn btn--sm btn--${isActive ? 'primary' : 'secondary'}`}>
              {t.label}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </div>
    </div>
  );
}
