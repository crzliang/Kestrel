import type { TrendPoint } from '../services/api';

export function mergeTrendPoints(series: TrendPoint[][]): TrendPoint[] {
  const map = new Map<string, { pv: number; uv: number }>();
  for (const points of series) {
    for (const p of points) {
      const cur = map.get(p.date) ?? { pv: 0, uv: 0 };
      cur.pv += p.pv;
      cur.uv += p.uv;
      map.set(p.date, cur);
    }
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, pv: v.pv, uv: v.uv }));
}

export function mergeNamedRanking<T extends { pv: number }>(
  lists: T[][],
  keyOf: (row: T) => string,
  limit = 10,
): Array<T & { pv: number }> {
  const map = new Map<string, T>();
  for (const list of lists) {
    for (const row of list) {
      const key = keyOf(row);
      const prev = map.get(key);
      if (prev) {
        map.set(key, { ...prev, ...row, pv: prev.pv + row.pv });
      } else {
        map.set(key, { ...row });
      }
    }
  }
  return [...map.values()].sort((a, b) => b.pv - a.pv).slice(0, limit);
}
