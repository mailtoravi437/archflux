import type { DiagramRoleWire } from '../../lib/api';
import { readOnlyBannerText } from '../../lib/access';

/**
 * Banner shown above a diagram the caller may not edit (AccessStates.dc.html "Read-only viewer").
 * Renders nothing for editors and owners.
 */
export default function ReadOnlyBanner({ role, title, onRequestEdit }: { role: DiagramRoleWire | null | undefined; title?: string; onRequestEdit?: () => void }) {
  const text = readOnlyBannerText(role);
  if (!text) return null;
  const viewer = role !== 'commenter';
  return (
    <div role="status" aria-label="Access level" style={{ height: 40, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', background: '#FFFFFF', borderBottom: '1px solid #E3E6EB', fontSize: 13, color: '#1B1F27' }}>
      {title && <span style={{ fontWeight: 600 }}>{title}</span>}
      <span style={{ padding: '1px 8px', borderRadius: 999, background: '#F1F2F5', fontSize: 11, fontWeight: 600 }}>{viewer ? 'View only' : 'Can comment'}</span>
      <span style={{ flexGrow: 1 }} />
      {viewer && onRequestEdit && (
        <button type="button" onClick={onRequestEdit} style={{ height: 28, padding: '0 10px', border: '1px solid #E3E6EB', borderRadius: 6, background: '#FFFFFF', font: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Request edit access</button>
      )}
    </div>
  );
}
