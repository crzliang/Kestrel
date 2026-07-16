import { useEffect, useMemo, useState } from 'react';
import { Alert, Card, Col, Row, Spin, Table } from 'antd';
import ReactECharts from 'echarts-for-react';
import PageHeader from '../components/PageHeader';
import {
  fetchRealtime,
  fetchTrend,
  fetchPages,
  fetchSources,
  type TrendPoint,
} from '../services/api';
import { useSiteStore } from '../store/site';
import { useThemeStore } from '../store/theme';
import type { RealtimeStats, PageStats, SourceStats } from '@kestrel/shared';

const SOURCE_LABELS: Record<string, string> = {
  direct: '直接访问',
  search: '搜索引擎',
  social: '社交媒体',
  email: '邮件',
  referral: '外部引荐',
  unknown: '未知',
};

export default function DashboardPage() {
  const siteId = useSiteStore((s) => s.siteId);
  const sites = useSiteStore((s) => s.sites);
  const mode = useThemeStore((s) => s.mode);
  const siteName = sites.find((s) => s.id === siteId)?.name ?? siteId;

  const [realtime, setRealtime] = useState<RealtimeStats | null>(null);
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [pages, setPages] = useState<PageStats | null>(null);
  const [sources, setSources] = useState<SourceStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const load = async () => {
      try {
        const [rt, trend, pageRes, sourceRes] = await Promise.all([
          fetchRealtime(siteId),
          fetchTrend(siteId, 7).catch(() => ({ points: [] as TrendPoint[] })),
          fetchPages(siteId, 8).catch(() => null),
          fetchSources(siteId).catch(() => null),
        ]);
        if (!cancelled) {
          setRealtime(rt);
          setPoints(trend.points);
          setPages(pageRes);
          setSources(sourceRes);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载失败');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    timer = window.setInterval(() => void load(), 8000);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [siteId]);

  const dark = mode === 'dark';
  const muted = dark ? '#94a3b8' : '#64748b';
  const line = dark ? '#1f2937' : '#e2e8f0';
  const ink = dark ? '#e5eef7' : '#0f172a';

  const chartOption = useMemo(
    () => ({
      color: ['#34d399', '#059669'],
      textStyle: { color: ink },
      tooltip: { trigger: 'axis' },
      grid: { left: 36, right: 16, top: 24, bottom: 28 },
      xAxis: {
        type: 'category',
        data: points.map((p) => p.date.slice(5)),
        axisLabel: { color: muted },
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
          type: 'bar',
          stack: 'traffic',
          barMaxWidth: 28,
          itemStyle: { borderRadius: [4, 4, 0, 0], color: '#34d399' },
          data: points.map((p) => p.pv),
        },
        {
          name: 'UV',
          type: 'bar',
          stack: 'traffic',
          barMaxWidth: 28,
          itemStyle: { borderRadius: [4, 4, 0, 0], color: '#059669' },
          data: points.map((p) => p.uv),
        },
      ],
    }),
    [points, ink, muted, line],
  );

  const metrics = [
    { label: '当前在线', value: realtime?.online ?? 0 },
    { label: '今日 PV', value: realtime?.pvToday ?? 0 },
    {
      label: '近 7 日 PV',
      value: points.reduce((sum, p) => sum + p.pv, 0),
    },
    {
      label: '近 7 日 UV',
      value: points.reduce((sum, p) => sum + p.uv, 0),
    },
  ];

  return (
    <div className="page page-wide">
      <PageHeader
        title="访问总览"
        description={`${siteName} 的实时指标与近 7 日趋势。`}
        extra={<span className="live-pill">Live</span>}
      />

      {error && (
        <Alert
          type="warning"
          showIcon
          message="无法连接实时 API"
          description={`${error}（本地未部署 EdgeOne 时属正常）`}
          style={{ marginBottom: 16 }}
        />
      )}

      <Spin spinning={loading && !realtime}>
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          {metrics.map((m) => (
            <Col xs={12} md={6} key={m.label}>
              <Card className="stat-card" bordered>
                <div className="metric-label">{m.label}</div>
                <div className="metric-value">{m.value.toLocaleString()}</div>
              </Card>
            </Col>
          ))}
        </Row>

        <Card
          className="chart-card"
          bordered
          title="访问趋势"
          style={{ marginBottom: 16 }}
        >
          <ReactECharts option={chartOption} style={{ height: 280 }} />
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card className="chart-card" bordered title="热门路径">
              <Table
                className="utility-table"
                size="small"
                pagination={false}
                rowKey="path"
                dataSource={pages?.ranking ?? []}
                columns={[
                  { title: 'Path', dataIndex: 'path', ellipsis: true },
                  { title: 'Views', dataIndex: 'pv', width: 72 },
                ]}
              />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card className="chart-card" bordered title="流量来源">
              <Table
                className="utility-table"
                size="small"
                pagination={false}
                rowKey="source"
                dataSource={sources?.ranking ?? []}
                columns={[
                  {
                    title: 'Source',
                    dataIndex: 'source',
                    render: (s: string) => SOURCE_LABELS[s] ?? s,
                  },
                  { title: 'Views', dataIndex: 'pv', width: 72 },
                ]}
              />
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  );
}
