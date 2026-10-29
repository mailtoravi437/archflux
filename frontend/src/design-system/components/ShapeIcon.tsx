import { iconLibrary, type ShapeIconKey } from './iconLibrary';

interface ShapeIconProps { name: ShapeIconKey; size?: number; className?: string; }

export const ShapeIcon = ({ name, size = 22, className }: ShapeIconProps) => {
  const src = iconLibrary[name]?.src;
  if (!src) return null;
  return <img src={src} alt="" className={className} style={{ width: size, height: size, flexShrink: 0 }} aria-hidden="true" />;
};

export { iconLibrary, type ShapeIconKey };
export const getIconSrc = (name: ShapeIconKey) => iconLibrary[name]?.src ?? null;
export const getIconKind = (name: ShapeIconKey) => iconLibrary[name]?.kind;
