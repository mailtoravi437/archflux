import { useId, useRef, useState, type CSSProperties } from 'react';
import type { ArchNode, PropertyValue } from '../../types';
import { useDiagram } from '../../state/useDiagram';
import { Section } from '../../components/Section';
import {
  STANDARD_PROPERTIES, formatPropertyValue, parsePropertyInput, validatePropertyKey, validatePropertyValue,
} from '../../lib/properties';

const FIELD_LABEL: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' };
const FIELD_INPUT: CSSProperties = {
  width: '100%', boxSizing: 'border-box', height: 32, padding: '0 10px', borderRadius: 6,
  border: '1px solid var(--border-panel)', background: 'var(--bg-panel-subtle)', color: 'var(--text-main)',
  font: 'inherit', fontSize: 13,
};
const ERROR: CSSProperties = { fontSize: 11, color: 'var(--accent-rose)' };
const STANDARD_KEYS = new Set(STANDARD_PROPERTIES.map((p) => p.key));

/**
 * Typed element properties (R1-E02-T07, DATA_MODEL_R1 §2.6): standard keys as typed inputs, custom keys,
 * and the doc-wide "Show on card" choice (`doc.defaults.propertyLine`). One undo step per field edit.
 */
export function PropertiesSection({ node, storageKey }: { node: ArchNode; storageKey?: string }) {
  const { checkpoint, updateNode, docDefaults, setDocDefaults } = useDiagram();
  const baseId = useId();
  const props = node.properties ?? {};
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  // The first change after a focus takes the undo checkpoint; later keystrokes in the same edit do not.
  const checkpointed = useRef(false);

  const write = (key: string, value: PropertyValue | undefined) => {
    if (!checkpointed.current) {
      checkpoint(false);
      checkpointed.current = true;
    }
    const next: Record<string, PropertyValue> = { ...props };
    if (value === undefined) delete next[key];
    else next[key] = value;
    updateNode(node.id, { properties: Object.keys(next).length > 0 ? next : undefined });
  };

  const onEdit = (key: string, text: string) => {
    setDrafts((d) => ({ ...d, [key]: text }));
    const err = validatePropertyValue(key, text);
    setErrors((e) => {
      const { [key]: _drop, ...rest } = e;
      return err ? { ...rest, [key]: err } : rest;
    });
    if (!err) write(key, parsePropertyInput(key, text));
  };
  const shown = (key: string): string => drafts[key] ?? (props[key] === undefined || props[key] === null ? '' : String(props[key]));
  const onFocus = () => { checkpointed.current = false; };
  const onBlur = (key: string) => {
    setDrafts((d) => {
      const { [key]: _drop, ...rest } = d;
      return rest;
    });
    setErrors((e) => {
      const { [key]: _drop, ...rest } = e;
      return rest;
    });
  };

  const customKeys = Object.keys(props).filter((k) => !STANDARD_KEYS.has(k));
  const cardKey = docDefaults.propertyLine ?? 'owner';
  const cardChoices = [...STANDARD_PROPERTIES.filter((p) => p.onCard).map((p) => ({ key: p.key, label: p.label })), ...customKeys.map((k) => ({ key: k, label: k }))];
  if (!cardChoices.some((c) => c.key === cardKey)) cardChoices.push({ key: cardKey, label: cardKey });
  const cardLabel = cardChoices.find((c) => c.key === cardKey)?.label ?? cardKey;
  const cardText = formatPropertyValue(cardKey, props[cardKey]);

  const addProperty = () => {
    const key = newKey.trim();
    const keyErr = validatePropertyKey(key, Object.keys(props));
    const valErr = keyErr ? null : validatePropertyValue(key, newValue);
    if (keyErr || valErr) {
      setAddError(keyErr ?? valErr);
      return;
    }
    checkpoint(false);
    updateNode(node.id, { properties: { ...props, [key]: newValue } });
    setNewKey('');
    setNewValue('');
    setAddError(null);
  };

  return (
    <Section id="properties" title="Properties" summary={`${Object.keys(props).length} set`} storageKey={storageKey} level={4}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {STANDARD_PROPERTIES.map((p) => {
          const err = errors[p.key];
          const errId = `${baseId}-${p.key}-err`;
          return (
            <div key={p.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={FIELD_LABEL}>
                {p.suffix ? `${p.label} (${p.suffix})` : p.label}
                {p.type === 'select' ? (
                  <select
                    style={FIELD_INPUT}
                    value={shown(p.key)}
                    onFocus={onFocus}
                    onChange={(e) => onEdit(p.key, e.target.value)}
                  >
                    <option value="">Not set</option>
                    {(p.options ?? []).map((o) => <option key={o} value={o}>{p.key === 'tier' ? `Tier ${o}` : o}</option>)}
                  </select>
                ) : (
                  <input
                    style={FIELD_INPUT}
                    type={p.type === 'number' ? 'number' : p.type === 'url' ? 'url' : 'text'}
                    min={p.type === 'number' ? 0 : undefined}
                    inputMode={p.type === 'number' ? 'decimal' : undefined}
                    value={shown(p.key)}
                    aria-invalid={err ? true : undefined}
                    aria-describedby={err ? errId : undefined}
                    onFocus={onFocus}
                    onBlur={() => onBlur(p.key)}
                    onChange={(e) => onEdit(p.key, e.target.value)}
                  />
                )}
              </label>
              {err && <span id={errId} role="alert" style={ERROR}>{err}</span>}
            </div>
          );
        })}
        {customKeys.map((k) => {
          const err = errors[k];
          const errId = `${baseId}-c-${k}-err`;
          return (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                <label style={{ ...FIELD_LABEL, flexGrow: 1 }}>
                  {k}
                  <input
                    style={FIELD_INPUT}
                    value={shown(k)}
                    aria-invalid={err ? true : undefined}
                    aria-describedby={err ? errId : undefined}
                    onFocus={onFocus}
                    onBlur={() => onBlur(k)}
                    onChange={(e) => onEdit(k, e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn--sm btn--secondary"
                  aria-label={`Remove property ${k}`}
                  style={{ height: 32 }}
                  onClick={() => { checkpointed.current = false; write(k, undefined); }}
                >
                  Remove
                </button>
              </div>
              {err && <span id={errId} role="alert" style={ERROR}>{err}</span>}
            </div>
          );
        })}
        <div role="group" aria-label="Add property" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            style={FIELD_INPUT}
            aria-label="New property key"
            placeholder="key, e.g. team"
            value={newKey}
            aria-invalid={addError ? true : undefined}
            aria-describedby={addError ? `${baseId}-add-err` : undefined}
            onChange={(e) => { setNewKey(e.target.value); setAddError(null); }}
          />
          <input
            style={FIELD_INPUT}
            aria-label="New property value"
            placeholder="value"
            value={newValue}
            onChange={(e) => { setNewValue(e.target.value); setAddError(null); }}
          />
          {addError && <span id={`${baseId}-add-err`} role="alert" style={ERROR}>{addError}</span>}
          <button type="button" className="btn btn--sm btn--secondary" onClick={addProperty}>Add property</button>
        </div>
        <label style={FIELD_LABEL}>
          Show on card
          <select style={FIELD_INPUT} value={cardKey} onChange={(e) => setDocDefaults({ propertyLine: e.target.value })}>
            {cardChoices.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {cardText ? `Card line: ${cardLabel}: ${cardText}` : `Card line: ${cardLabel} is not set on this element`}
        </span>
      </div>
    </Section>
  );
}
