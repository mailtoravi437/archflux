import { useState } from 'react';
import { getActiveWorkspaceId, setActiveWorkspaceId } from '../lib/api';
import { getKnownWorkspaces } from '../lib/workspaceSetup';

/**
 * Account-menu workspace switcher (R1-E11-T03). Lists the workspaces this browser has joined (the API has
 * no "list my workspaces" endpoint yet) and persists the choice for `X-Workspace-ID`.
 * Renders nothing until the user has joined another workspace.
 */
export default function WorkspaceSwitcher({ onSwitched }: { onSwitched?: (id: string | null) => void }) {
  const known = getKnownWorkspaces();
  const [active, setActive] = useState<string>(() => getActiveWorkspaceId() ?? '');
  if (known.length === 0) return null;
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#5B6474' }}>
      Workspace
      <select
        aria-label="Workspace"
        value={active}
        style={{ height: 32, border: '1px solid #E3E6EB', borderRadius: 6, padding: '0 8px', font: 'inherit', color: '#1B1F27', background: '#FFFFFF' }}
        onChange={(e) => {
          const id = e.target.value || null;
          setActive(e.target.value);
          setActiveWorkspaceId(id);
          onSwitched?.(id);
        }}
      >
        <option value="">Personal workspace</option>
        {known.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
    </label>
  );
}
