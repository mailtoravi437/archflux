/** Inspector and selection-toolbar palettes (colours, widths, icons, protocols). */
export const STROKE_COLORS = ['#1F2937', '#4F46E5', '#2563EB', '#16A34A', '#F0B86E', '#DC2626'];
export const STROKE_WIDTHS = [2, 4, 6];

export const NODE_ICONS = [
  '/icons/node-icons/box.svg',
  '/icons/node-icons/gateway.svg',
  '/icons/node-icons/database.svg',
  '/icons/node-icons/stream.svg',
  '/icons/node-icons/lightning.svg',
  '/icons/node-icons/lock.svg',
  '/icons/node-icons/k8s.svg',
  '/icons/node-icons/elephant.svg',
  '/icons/node-icons/red.svg',
  '/icons/node-icons/mail.svg',
  '/icons/node-icons/lambda.svg',
  '/icons/node-icons/globe.svg',
];
export const PROTOCOLS = ['REST', 'gRPC', 'WebSocket', 'Async'];
export const NODE_STROKE_WIDTHS = [1, 1.5, 2.5, 4];

/** Node colours from Main.dc.html L180–L237 (R1-E14-T03). Names are the accessible names. */
export const NODE_COLOURS = [
  { name: 'Blue', value: '#2563EB' },
  { name: 'Violet', value: '#7C3AED' },
  { name: 'Green', value: '#15803D' },
  { name: 'Amber', value: '#D97706' },
  { name: 'Red', value: '#DC2626' },
  { name: 'Gray', value: '#6B7280' },
] as const;

// R1-BUG-01: the second entry was a duplicate accent, which gave React duplicate keys.
export const BORDER_SWATCHES = ['#4F46E5', '#2563EB', '#16A34A', '#F0B86E', '#DC2626', '#6B7280'];
export const FILL_SWATCHES = ['#FFFFFF', '#DBEAFE', '#DCFCE7', '#FEF3C7', '#FEE2E2', '#EDE9FE'];
