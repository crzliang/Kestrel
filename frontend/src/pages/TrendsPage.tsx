import { useEffect, useMemo, useState } from 'react';
import { Card, Alert, Spin } from 'antd';
import ReactECharts from 'echarts-for-react';
import PageHeader from '../components/PageHeader';
import TrendRangeControl, {
  toTrendQuery,
  type TrendRangeValue,
} from '../components/TrendRangeControl';
import { fetchTrend, type TrendPoint } from '../services/api';
import { useSiteStore } from '../store/site';
import { useThemeStore } from '../store/theme';

export default function TrendsPage() {
  const siteId = useSiteStore((s) => s.siteId);
  const mode = useThemeStore((s) => s.mode);
  const [range, setRange] = useState<TrendRangeValue>({ preset: '30d' });
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const trendQuery = useMemo(() => toTrendQuery(range), [range]);

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
  const muted = dark ? '#94a3b8' : '#64748b';
  const line = dark ? '#1f2937' : '#e2e8f0';
  const ink = dark ? '#e5eef7' : '#0f172a';

  const option = {
    color: ['#059669', '#2563eb'],
    textStyle: { color: ink },
    tooltip: { trigger: 'axis' },
    legend: { data: ['PV', 'UV'], textStyle: { color: muted } },
    grid: { left: 40, right: 20, top: 40, bottom: 30 },
    xAxis: {
      type: 'category',
      data: points.map((p) => p.date.slice(5)),
      boundaryGap: false,
      axisLabel: {
        color: muted,
        interval: points.length > 20 ? 2 : 0,
        hideOverlap: true,
      },
      axisLine: { lineStyle: { color: line } },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: muted },
      splitLine: { lineStyle: { color: line } },
    },
    series: [
      {
        name: 'PV',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.1 },
        data: points.map((p) => p.pv),
      },
      {
        name: 'UV',
        type: 'line',
        smooth: true,
        data: points.map((p) => p.uv),
      },
    ],
  };

  return (
    <div className="page">
      <PageHeader
        title="流量趋势"
        description="按时间范围查看 PV / UV。"
        extra={
          <TrendRangeControl value={range} onChange={setRange} />
        }
      />
      {error && (
        <Alert
          type="warning"
          showIcon
          message="趋势数据暂不可用"
          description={error}
          style={{ marginBottom: 16 }}
        />
      )}
      <Card className="chart-card" bordered>
        <Spin spinning={loading}>
          <ReactECharts option={option} style={{ height: 360 }} notMerge />
        </Spin>
      </Card>
    </div>
  );
}
