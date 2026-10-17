import { neutral, brand, semantic, canvas, node, edge, status } from '../tokens/colors';

export const lightTheme = {
  name: 'light' as const,
  colors: {
    ...neutral.light,
    brandPrimary: brand.primary.light,
    brandHover: brand.hover.light,
    brandPressed: brand.pressed.light,
    brandSubtle: brand.subtle.light,
    brandBorder: brand.border.light,
    brandText: brand.text.light,
    semantic: semantic.light,
    canvas: canvas.light,
    node: node.light,
    edge: edge.light,
    status,
  },
  shadow: '0 1px 3px rgba(0,0,0,0.08)',
} as const;
