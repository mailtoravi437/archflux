import { useEffect, useState } from 'react';

function read(): number {
  return typeof window === 'undefined' ? 1440 : window.innerWidth;
}

/** Current window width, updated on resize (responsive app bar, UI_REVAMP_SPEC §7). */
export function useViewportWidth(): number {
  const [w, setW] = useState(read);
  useEffect(() => {
    const onResize = () => setW(read());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return w;
}
