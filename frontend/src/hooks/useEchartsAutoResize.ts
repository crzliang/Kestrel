import { useEffect, type RefObject } from 'react';
import type ReactECharts from 'echarts-for-react';

/** Resize echarts when its host element size changes. */
export function useEchartsAutoResize(
  hostRef: RefObject<HTMLElement | null>,
  chartRef: RefObject<ReactECharts | null>,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    const host = hostRef.current;
    if (!host) return;

    const resize = () => {
      chartRef.current?.getEchartsInstance?.()?.resize();
    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(host);
    window.addEventListener('resize', resize);
    resize();

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [hostRef, chartRef, enabled]);
}
