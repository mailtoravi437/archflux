import { useEffect, useRef, useState } from 'react';
import type { NodeIconSource } from '../../canvas/render';

// Freehand ink + vendor icon cache (module-level so remounts don't refetch).
const iconImgCache = new Map<string, HTMLImageElement>();
// In-flight draw-cache image loads. Visual tests wait for this to drain so
// screenshots never catch half-painted vendor icons.
let pendingIconLoads = 0;
const iconSettleListeners = new Set<() => void>();
function noteIconSettled() {
  pendingIconLoads = Math.max(0, pendingIconLoads - 1);
  if (pendingIconLoads === 0) iconSettleListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}
function trackIconLoad() {
  pendingIconLoads += 1;
}

/**
 * Vendor-icon cache bridge for the shared render passes plus the startup
 * preload. `iconsReady` flips once the preload and every in-flight draw-cache
 * load have settled (visual tests wait on it via data-icons-ready).
 */
export function useVendorIcons(): { iconsAdapter: NodeIconSource; iconsReady: boolean } {
  // Vendor-icon preload completion — visual tests wait on this for stable pixels.
  const [iconsReady, setIconsReady] = useState(false);
  const preloadDoneRef = useRef(false);
  // Bumps when a vendor icon finishes loading so the canvas repaints it.
  const [, setIconTick] = useState(0);
  // Shared render-pass vendor-icon bridge: pass calls get() before painting
  // (only complete images draw) and ensure() registers in-flight loads; the
  // drain counter resumes visual tests waiting for stable pixels.
  const iconsAdapter: NodeIconSource = {
    get: (src) => iconImgCache.get(src) ?? null,
    ensure: (src) => {
      if (iconImgCache.has(src)) return;
      const img = new Image();
      trackIconLoad();
      img.onload = () => { setIconTick((t) => t + 1); noteIconSettled(); };
      img.onerror = () => { iconImgCache.delete(src); noteIconSettled(); };
      iconImgCache.set(src, img);
      img.src = src;
    },
  };

  // Preload all vendor icons at startup so they're cached before rendering
  useEffect(() => {
    const iconUrls = [
      '/icons/aws/ec2.svg', '/icons/aws/lambda.svg', '/icons/aws/ecs.svg', '/icons/aws/rds.svg',
      '/icons/aws/s3.svg', '/icons/aws/sqs.svg', '/icons/aws/sns.svg', '/icons/aws/alb.svg',
      '/icons/aws/apigw.svg', '/icons/aws/cfront.svg', '/icons/aws/cw.svg', '/icons/aws/dynamo.svg',
      '/icons/aws/ec2.svg', '/icons/aws/ecs.svg', '/icons/aws/lambda.svg', '/icons/aws/rds.svg',
      '/icons/general/service.svg', '/icons/general/gateway.svg', '/icons/general/database.svg',
      '/icons/general/stream.svg', '/icons/tools/select.svg', '/icons/tools/pan.svg',
      '/icons/tools/draw.svg', '/icons/tools/text.svg', '/icons/tools/service.svg',
      '/icons/tools/gateway.svg', '/icons/tools/database.svg', '/icons/tools/stream.svg',
      '/icons/tools/connector.svg', '/icons/tools/comment.svg',
      '/icons/node-icons/box.svg', '/icons/node-icons/gateway.svg', '/icons/node-icons/database.svg',
      '/icons/node-icons/stream.svg', '/icons/node-icons/lightning.svg', '/icons/node-icons/lock.svg',
      '/icons/node-icons/k8s.svg', '/icons/node-icons/elephant.svg', '/icons/node-icons/red.svg',
      '/icons/node-icons/mail.svg', '/icons/node-icons/lambda.svg', '/icons/node-icons/globe.svg',
      '/icons/tools/lock.svg', '/icons/tools/more.svg'
    ];
    let settled = 0;
    const done = () => {
      settled += 1;
      if (settled >= iconUrls.length) {
        preloadDoneRef.current = true;
        if (pendingIconLoads === 0) setIconsReady(true);
      }
    };
    iconUrls.forEach(url => {
      const img = new Image();
      img.onload = done;
      img.onerror = done;
      img.src = url;
    });
    // Draw-cache images settle independently of the preload above.
    const checkCacheDrained = () => {
      if (preloadDoneRef.current && pendingIconLoads === 0) setIconsReady(true);
    };
    iconSettleListeners.add(checkCacheDrained);
    checkCacheDrained();
    return () => {
      iconSettleListeners.delete(checkCacheDrained);
    };
  }, []);

  return { iconsAdapter, iconsReady };
}
