import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { Skeleton } from '../components/states';

export const withFallback = (node: ReactNode) => (
  <Suspense
    fallback={
      <div className="screen-view active" style={{ padding: 24 }}>
        <Skeleton label="Loading screen" />
      </div>
    }
  >
    {node}
  </Suspense>
);
