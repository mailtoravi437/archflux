import type { PropertyValue } from '../types';

/** Standard element properties (DATA_MODEL_R1 §2.6, CAP-M1). */
export interface StandardProperty {
  key: string;
  label: string;
  type: 'text' | 'url' | 'number' | 'select';
  options?: readonly string[];
  /** Unit suffix shown next to a number input. */
  suffix?: string;
  /** Offered in the "Show on card" choice. */
  onCard: boolean;
}

export const STANDARD_PROPERTIES: readonly StandardProperty[] = [
  { key: 'owner', label: 'Owner', type: 'text', onCard: true },
  { key: 'repo', label: 'Repository', type: 'url', onCard: false },
  { key: 'slo', label: 'SLO', type: 'text', onCard: true },
  { key: 'cost', label: 'Cost', type: 'number', suffix: 'USD/mo', onCard: true },
  { key: 'dataClass', label: 'Data class', type: 'select', options: ['public', 'internal', 'confidential', 'restricted'], onCard: true },
  { key: 'tier', label: 'Tier', type: 'select', options: ['1', '2', '3'], onCard: true },
  { key: 'runtime', label: 'Runtime', type: 'text', onCard: false },
];

export const MAX_PROPERTIES = 30;
export const MAX_PROPERTY_VALUE = 500;
const KEY_RE = /^[a-z][a-zA-Z0-9]{0,31}$/;

/** Error message for a new custom key, or null when valid. `existing` are the keys already on the element. */
export function validatePropertyKey(key: string, existing: readonly string[] = []): string | null {
  if (!KEY_RE.test(key)) return 'Use a lowercase camelCase key, up to 32 characters (letters and digits only)';
  if (existing.includes(key)) return 'That property already exists';
  if (existing.length >= MAX_PROPERTIES) return `An element can have at most ${MAX_PROPERTIES} properties`;
  return null;
}

/** Error message for a value typed into `key`, or null when valid. An empty string is valid (it clears the property). */
export function validatePropertyValue(key: string, value: string): string | null {
  if (value.length > MAX_PROPERTY_VALUE) return `Keep it under ${MAX_PROPERTY_VALUE} characters`;
  if (value === '') return null;
  const std = STANDARD_PROPERTIES.find((p) => p.key === key);
  if (!std) return null;
  if (std.type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 'Enter a number of 0 or more';
  } else if (std.type === 'url') {
    try {
      const u = new URL(value);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Use an http or https URL';
    } catch {
      return 'Enter a valid URL, e.g. https://github.com/org/repo';
    }
  } else if (std.type === 'select' && !(std.options ?? []).includes(value)) {
    return 'Pick one of the listed values';
  }
  return null;
}

/** Text form of a stored value for display (card line, inspector summary). Empty for unset values. */
export function formatPropertyValue(key: string, value: PropertyValue | undefined): string {
  if (value === undefined || value === null || value === '') return '';
  if (key === 'cost' && typeof value === 'number') return `$${value.toLocaleString('en-US')}/mo`;
  if (key === 'tier') return `Tier ${String(value)}`;
  return String(value);
}

/** Parse validated input text into the stored value ('' means unset). */
export function parsePropertyInput(key: string, text: string): PropertyValue | undefined {
  if (text === '') return undefined;
  const std = STANDARD_PROPERTIES.find((p) => p.key === key);
  return std?.type === 'number' ? Number(text) : text;
}
