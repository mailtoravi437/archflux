import { NavLink, Outlet } from 'react-router-dom';

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
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Settings</h2>
        <nav style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} aria-label="Settings sections">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => `btn-xs${isActive ? ' btn-xs-primary' : ''}`}>
              {t.label}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </div>
    </div>
  );
}
