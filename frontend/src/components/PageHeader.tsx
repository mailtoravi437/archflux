import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Buttons on the right; at most one of them is primary. */
  actions?: ReactNode;
}

/**
 * The page header every screen uses (R1-E01-T08): exactly one h1, an optional
 * muted subtitle and the page actions. Matches the Library artboard header
 * (22/28 bold title, 13 px subtitle, 16 px gap, actions bottom-aligned).
 */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="libpage-header" data-testid="page-header">
      <div className="libpage-header__text">
        <h1 className="libpage-title">{title}</h1>
        {subtitle && <p className="libpage-subtitle">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export default PageHeader;
