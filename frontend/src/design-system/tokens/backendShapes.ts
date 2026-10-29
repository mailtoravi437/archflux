export const backendShapes = {
  microservice: { label: 'Microservice', icon: 'hexagon', color: '#8B83FF' },
  database: { label: 'Database', icon: 'cylinder', color: '#8B83FF' },
  queue: { label: 'Queue', icon: 'stacked-bars', color: '#8B83FF' },
  gateway: { label: 'API Gateway', icon: 'shield', color: '#8B83FF' },
} as const;

export const backendNodeStyling = {
  dark: { fill: '#191D25', border: '#4B5363', text: '#F2F4F8', selectedBorder: '#8B83FF', iconColor: '#A1A9B8' },
  light: { fill: '#FFFFFF', border: '#C7CDD7', text: '#20242D', selectedBorder: '#4F46E5', iconColor: '#626B7A' },
} as const;
