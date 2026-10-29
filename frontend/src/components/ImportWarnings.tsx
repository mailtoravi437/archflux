/**
 * Expandable import-warning list (PROD-007). Shown in the import success
 * path whenever validation recovers with non-fatal warnings — the import
 * itself already succeeded, so this is a `status`, not an error.
 */
export default function ImportWarnings({
  fileName,
  warnings,
  onClose,
}: {
  fileName: string;
  warnings: string[];
  onClose: () => void;
}) {
  if (warnings.length === 0) return null;
  return (
    <div
      className="callout-block"
      role="status"
      aria-label={`Import warnings for ${fileName}`}
      style={{ borderLeftColor: 'var(--accent-amber)' }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>
          Imported {fileName} with {warnings.length} warning{warnings.length === 1 ? '' : 's'}
        </strong>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn--sm btn--secondary" onClick={onClose}>
          Dismiss
        </button>
      </div>
      <details style={{ marginTop: 6 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12 }}>Show warnings</summary>
        <ul style={{ fontSize: 11, fontFamily: 'var(--mono-font)', color: 'var(--text-muted)', margin: '6px 0 0', paddingLeft: 18 }}>
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
