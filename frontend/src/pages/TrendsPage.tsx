import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Spin } from 'antd';
import ReactECharts from 'echarts-for-react';
import PageHeader from '../components/PageHeader';
import TrendRangeControl, {
  rangeLabel,
  toTrendQuery,
  type TrendRangeValue,
} from '../components/TrendRangeControl';
import { useEchartsAutoResize } from '../hooks/useEchartsAutoResize';
import { fetchTrend, type TrendPoint } from '../services/api';
import { useSiteStore } from '../store/site';
import { useThemeStore } from '../store/theme';

function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

function summarize(points: TrendPoint[]) {
  const totalPv = points.reduce((s, p) => s + p.pv, 0);
  const totalUv = points.reduce((s, p) => s + p.uv, 0);
  const days = Math.max(points.length, 1);
  const peak = points.reduce<TrendPoint | null>(
    (best, p) => (!best || p.pv > best.pv ? p : best),
    null,
  );

  let deltaPv: number | null = null;
  if (points.length >= 4) {
    const mid = Math.floor(points.length / 2);
    const first = points.slice(0, mid).reduce((s, p) => s + p.pv, 0);
    const second = points.slice(mid).reduce((s, p) => s + p.pv, 0);
    if (first > 0) deltaPv = ((second - first) / first) * 100;
  }

  return {
    totalPv,
    totalUv,
    avgPv: Math.round(totalPv / days),
    avgUv: Math.round(totalUv / days),
    peak,
    deltaPv,
    days: points.length,
  };
}

export default function TrendsPage() {
  const siteId = useSiteStore((s) => s.siteId);
  const mode = useThemeStore((s) => s.mode);
  const [range, setRange] = useState<TrendRangeValue>({ preset: '30d' });
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const chartRef = useRef<ReactECharts>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  useEchartsAutoResize(hostRef, chartRef);

  const trendQuery = useMemo(() => toTrendQuery(range), [range]);
  const stats = useMemo(() => summarize(points), [points]);
  const label = rangeLabel(range);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchTrend(siteId, trendQuery);
        if (!cancelled) {
          setPoints(res.points);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载失败');
          setPoints([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId, trendQuery]);

  const dark = mode === 'dark';

  const option = useMemo(() => {
    const muted = dark ? '#94a3b8' : '#64748b';
    const line = dark ? '#1f2937' : '#e2e8f0';
    const ink = dark ? '#e5eef7' : '#0f172a';
    const pv = dark ? '#34d399' : '#059669';
    const uv = dark ? '#60a5fa' : '#2563eb';
    const tipBg = dark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255,255,255,0.97)';
    const tipBorder = dark ? '#334155' : '#e2e8f0';
    const longRange = points.length > 40;
    const peakIdx = stats.peak
      ? points.findIndex((p) => p.date === stats.peak!.date)
      : -1;

    return {
      color: [pv, uv],
      textStyle: { color: ink, fontFamily: 'IBM Plex Sans, sans-serif' },
      animationDuration: 700,
      animationEasing: 'cubicOut',
      tooltip: {
        trigger: 'axis',
        backgroundColor: tipBg,
        borderColor: tipBorder,
        borderWidth: 1,
        padding: [12, 14],
        textStyle: { color: ink, fontSize: 13 },
        axisPointer: {
          type: 'cross',
          crossStyle: { color: muted, opacity: 0.45 },
          lineStyle: { color: muted, type: 'dashed', width: 1 },
          label: {
            backgroundColor: dark ? '#1f2937' : '#0f172a',
            color: '#fff',
            borderRadius: 4,
            padding: [2, 6],
          },
        },
        formatter: (items: Array<{
          axisValue?: string;
          marker?: string;
          seriesName?: string;
          value?: number;
        }>) => {
          if (!items?.length) return '';
          const head = items[0]?.axisValue ?? '';
          const rows = items
            .map(
              (it) =>
                `<div style="display:flex;justify-content:space-between;gap:24px;margin-top:6px">
                  <span>${it.marker ?? ''}${it.seriesName ?? ''}</span>
                  <b style="font-variant-numeric:tabular-nums">${Number(it.value ?? 0).toLocaleString()}</b>
                </div>`,
            )
            .join('');
          return `<div style="font-weight:600;margin-bottom:2px">${head}</div>${rows}`;
        },
      },
      legend: {
        top: 8,
        right: 12,
        icon: 'roundRect',
        itemWidth: 12,
        itemHeight: 8,
        itemGap: 16,
        textStyle: { color: muted, fontSize: 12 },
      },
      grid: {
        left: 16,
        right: 16,
        top: 48,
        bottom: longRange ? 68 : 36,
        containLabel: true,
      },
      dataZoom: longRange
        ? [
            {
              type: 'inside',
              start: Math.max(0, 100 - (45 / points.length) * 100),
              end: 100,
              zoomOnMouseWheel: true,
              moveOnMouseMove: true,
            },
            {
              type: 'slider',
              height: 18,
              bottom: 12,
              borderColor: 'transparent',
              backgroundColor: dark ? '#111827' : '#f1f5f9',
              fillerColor: dark
                ? 'rgba(52, 211, 153, 0.18)'
                : 'rgba(5, 150, 105, 0.14)',
              handleStyle: {
                color: pv,
                borderColor: pv,
              },
              moveHandleStyle: { color: pv },
              textStyle: { color: muted, fontSize: 10 },
              dataBackground: {
                lineStyle: { color: muted, opacity: 0.35 },
                areaStyle: { color: muted, opacity: 0.08 },
              },
              selectedDataBackground: {
                lineStyle: { color: pv },
                areaStyle: { color: pv, opacity: 0.2 },
              },
            },
          ]
        : [
            {
              type: 'inside',
              start: 0,
              end: 100,
              zoomOnMouseWheel: 'shift',
            },
          ],
      xAxis: {
        type: 'category',
        data: points.map((p) => p.date.slice(5)),
        boundaryGap: false,
        axisLabel: {
          color: muted,
          fontSize: 11,
          hideOverlap: true,
          interval: points.length > 60 ? 'auto' : points.length > 20 ? 2 : 0,
        },
        axisTick: { show: false },
        axisLine: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: {
          color: muted,
          fontSize: 11,
          formatter: (v: number) => formatNum(v),
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: {
          lineStyle: {
            color: line,
            type: 'dashed',
            opacity: 0.85,
          },
        },
      },
      series: [
        {
          name: 'PV',
          type: 'line',
          smooth: 0.35,
          symbol: 'circle',
          symbolSize: 6,
          showSymbol: points.length <= 14,
          sampling: 'lttb',
          lineStyle: { width: 2.5, color: pv },
          itemStyle: { color: pv, borderColor: dark ? '#0b0f14' : '#fff', borderWidth: 2 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: dark ? 'rgba(52,211,153,0.32)' : 'rgba(5,150,105,0.22)' },
                { offset: 1, color: dark ? 'rgba(52,211,153,0)' : 'rgba(5,150,105,0)' },
              ],
            },
          },
          emphasis: {
            focus: 'series',
            itemStyle: { borderWidth: 2 },
          },
          markPoint:
            peakIdx >= 0 && stats.peak && stats.peak.pv > 0
              ? {
                  symbol: 'pin',
                  symbolSize: 42,
                  label: {
                    formatter: '{c}',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 600,
                  },
                  itemStyle: { color: pv },
                  data: [
                    {
                      name: '峰值',
                      value: stats.peak.pv,
                      xAxis: peakIdx,
                      yAxis: stats.peak.pv,
                    },
                  ],
                }
              : undefined,
          data: points.map((p) => p.pv),
        },
        {
          name: 'UV',
          type: 'line',
          smooth: 0.35,
          symbol: 'circle',
          symbolSize: 5,
          showSymbol: points.length <= 14,
          sampling: 'lttb',
          lineStyle: { width: 2, color: uv },
          itemStyle: { color: uv, borderColor: dark ? '#0b0f14' : '#fff', borderWidth: 2 },
          emphasis: { focus: 'series' },
          data: points.map((p) => p.uv),
        },
      ],
    };
  }, [points, dark, stats.peak]);

  const deltaText =
    stats.deltaPv == null
      ? null
      : `${stats.deltaPv >= 0 ? '+' : ''}${stats.deltaPv.toFixed(1)}%`;

  return (
    <div className="page trend-page">
      <PageHeader
        title="流量趋势"
        description={`${label} · PV / UV 走势`}
        extra={<TrendRangeControl value={range} onChange={setRange} />}
      />

      <div className="trend-metrics">
        <div className="trend-metric">
          <span className="trend-metric-label">区间 PV</span>
          <span className="trend-metric-value">{formatNum(stats.totalPv)}</span>
          {deltaText ? (
            <span
              className={`trend-metric-delta ${
                (stats.deltaPv ?? 0) >= 0 ? 'up' : 'down'
              }`}
            >
              后半段 vs 前半段 {deltaText}
            </span>
          ) : (
            <span className="trend-metric-sub">{stats.days} 天汇总</span>
          )}
        </div>
        <div className="trend-metric">
          <span className="trend-metric-label">区间 UV</span>
          <span className="trend-metric-value accent-2">
            {formatNum(stats.totalUv)}
          </span>
          <span className="trend-metric-sub">
            日均 {formatNum(stats.avgUv)}
          </span>
        </div>
        <div className="trend-metric">
          <span className="trend-metric-label">日均 PV</span>
          <span className="trend-metric-value">{formatNum(stats.avgPv)}</span>
          <span className="trend-metric-sub">基于 {stats.days} 个数据点</span>
        </div>
        <div className="trend-metric">
          <span className="trend-metric-label">峰值日</span>
          <span className="trend-metric-value accent">
            {stats.peak ? formatNum(stats.peak.pv) : '—'}
          </span>
          <span className="trend-metric-sub">
            {stats.peak ? stats.peak.date : '暂无数据'}
          </span>
        </div>
      </div>

      {error && (
        <Alert
          type="warning"
          showIcon
          message="趋势数据暂不可用"
          description={error}
          style={{ marginBottom: 16 }}
        />
      )}

      <div className="trend-stage">
        <div className="trend-stage-glow" aria-hidden />
        <div className="trend-stage-head">
          <div>
            <h2>访问曲线</h2>
            <p>平滑面积图 · 十字准星 · 长区间可拖动缩放</p>
          </div>
          <div className="trend-legend-hint">
            <span className="dot pv" /> PV
            <span className="dot uv" /> UV
          </div>
        </div>
        <Spin spinning={loading}>
          <div className="trend-chart-host" ref={hostRef}>
            <ReactECharts
              ref={chartRef}
              option={option}
              style={{ height: '100%', width: '100%' }}
              notMerge
              lazyUpdate
            />
          </div>
        </Spin>
      </div>
    </div>
  );
}
