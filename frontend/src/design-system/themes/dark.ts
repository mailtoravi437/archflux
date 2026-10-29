import { neutral, brand, semantic, canvas, node, edge, status } from '../tokens/colors';

export const darkTheme = {
  name: 'dark' as const,
  colors: {
    ...neutral.dark,
    brandPrimary: brand.primary.dark,
    brandHover: brand.hover.dark,
    brandPressed: brand.pressed.dark,
    brandSubtle: brand.subtle.dark,
    brandBorder: brand.border.dark,
    brandText: brand.text.dark,
    semantic: semantic.dark,
    canvas: canvas.dark,
    node: node.dark,
    edge: edge.dark,
    status,
  },
  shadow: '0 1px 3px rgba(0,0,0,0.35)',
} as const;
