import { Suspense } from 'react';
import type { ReactNode } from 'react';

export const withFallback = (node: ReactNode) => (
  <Suspense
    fallback={
      <div className="screen-view active" aria-busy="true" aria-label="Loading screen">
        <div style={{ margin: 'auto', fontSize: 13, fontFamily: 'var(--mono-font)', color: 'var(--text-muted)' }}>
          Loading ArchFlux…
        </div>
      </div>
    }
  >
    {node}
  </Suspense>
);