/** Labelled swatch row used by the Inspector (fill, border, route and text colour). */
export function Swatches(props: { values: (string | null)[]; current: string | undefined; nullLabel: string; onPick: (v: string | null) => void; label: string }) {
  const { values, current, nullLabel, onPick, label } = props;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} role="group" aria-label={label}>
        {values.map((v) =>
          v === null ? (
            <button
              key="default"
              className="btn btn--sm btn--secondary"
              title={nullLabel}
              onClick={() => onPick(null)}
              style={current === undefined ? { borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' } : undefined}
            >
              Auto
            </button>
          ) : (
            <button
              key={v}
              aria-label={`${label} ${v}`}
              title={v}
              onClick={() => onPick(v)}
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                border: current === v ? '2px solid var(--accent-cyan)' : '1px solid var(--border-panel-bright)',
                background: v,
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ),
        )}
      </div>
    </div>
  );
}
