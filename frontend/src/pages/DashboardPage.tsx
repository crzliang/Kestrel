import { useEffect, useMemo, useState } from 'react';
import { Alert, Card, Col, Row, Spin, Table } from 'antd';
import ReactECharts from 'echarts-for-react';
import PageHeader from '../components/PageHeader';
import SiteFavicon from '../components/SiteFavicon';
import TrendRangeControl, {
  rangeLabel,
  toTrendQuery,
  type TrendRangeValue,
} from '../components/TrendRangeControl';
import {
  fetchRealtime,
  fetchTrend,
  fetchPages,
  fetchSources,
  fetchIps,
  type TrendPoint,
} from '../services/api';
import { useSiteStore } from '../store/site';
import { useThemeStore } from '../store/theme';
import type {
  RealtimeStats,
  PageStats,
  SourceStats,
  IpStats,
} from '@kestrel/shared';

function hostLabel(host: string) {
  return !host || host === '(direct)' ? '直接访问' : host;
}

export default function DashboardPage() {
  const siteId = useSiteStore((s) => s.siteId);
  const sites = useSiteStore((s) => s.sites);
  const mode = useThemeStore((s) => s.mode);
  const siteName = sites.find((s) => s.id === siteId)?.name ?? siteId;

  const [range, setRange] = useState<TrendRangeValue>({ preset: '30d' });
  const [realtime, setRealtime] = useState<RealtimeStats | null>(null);
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [pages, setPages] = useState<PageStats | null>(null);
  const [sources, setSources] = useState<SourceStats | null>(null);
  const [ips, setIps] = useState<IpStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const trendQuery = useMemo(() => toTrendQuery(range), [range]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const load = async () => {
      try {
        const [rt, trend, pageRes, sourceRes, ipRes] = await Promise.all([
          fetchRealtime(siteId),
          fetchTrend(siteId, trendQuery).catch(() => ({
            points: [] as TrendPoint[],
          })),
          fetchPages(siteId, 10).catch(() => null),
          fetchSources(siteId).catch(() => null),
          fetchIps(siteId, 10).catch(() => null),
        ]);
        if (!cancelled) {
          setRealtime(rt);
          setPoints(trend.points);
          setPages(pageRes);
          setSources(sourceRes);
          setIps(ipRes);
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
  }, [siteId, trendQuery]);

  const dark = mode === 'dark';
  const muted = dark ? '#94a3b8' : '#64748b';
  const line = dark ? '#1f2937' : '#e2e8f0';
  const ink = dark ? '#e5eef7' : '#0f172a';
  const label = rangeLabel(range);

  const chartOption = useMemo(
    () => ({
      color: ['#34d399', '#059669'],
      textStyle: { color: ink },
      tooltip: { trigger: 'axis' },
      grid: { left: 36, right: 12, top: 20, bottom: 22, containLabel: false },
      xAxis: {
        type: 'category',
        data: points.map((p) => p.date.slice(5)),
        boundaryGap: true,
        axisLabel: {
          color: muted,
          fontSize: 10,
          interval: points.length > 20 ? 2 : 0,
          hideOverlap: true,
        },
        axisTick: { alignWithLabel: true, length: 3 },
        axisLine: { lineStyle: { color: line } },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { color: muted, fontSize: 10 },
        splitLine: { lineStyle: { color: line, type: 'dashed' } },
      },
      series: [
        {
          name: 'PV',
          type: 'bar',
          stack: 'traffic',
          barWidth: '78%',
          barMaxWidth: 18,
          barCategoryGap: '8%',
          itemStyle: { borderRadius: [2, 2, 0, 0], color: '#34d399' },
          data: points.map((p) => p.pv),
        },
        {
          name: 'UV',
          type: 'bar',
          stack: 'traffic',
          barWidth: '78%',
          barMaxWidth: 18,
          itemStyle: { borderRadius: [2, 2, 0, 0], color: '#059669' },
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
      label: `${label} PV`,
      value: points.reduce((sum, p) => sum + p.pv, 0),
    },
    {
      label: `${label} UV`,
      value: points.reduce((sum, p) => sum + p.uv, 0),
    },
  ];

  return (
    <div className="page page-wide">
      <PageHeader
        title="访问总览"
        description={`${siteName} 的实时指标与访问趋势。`}
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
          title={
            <div className="trend-card-head">
              <span>访问趋势</span>
              <TrendRangeControl value={range} onChange={setRange} />
            </div>
          }
          style={{ marginBottom: 16 }}
        >
          <ReactECharts option={chartOption} style={{ height: 280 }} notMerge />
        </Card>

        <Row gutter={[16, 16]} className="equal-cards-row">
          <Col xs={24} lg={8}>
            <Card className="chart-card equal-card" bordered title="热门路径">
              <div className="equal-card-body">
                <Table
                  className="utility-table"
                  size="small"
                  pagination={false}
                  rowKey="path"
                  dataSource={(pages?.ranking ?? []).slice(0, 10)}
                  columns={[
                    { title: 'Path', dataIndex: 'path', ellipsis: true },
                    { title: 'Views', dataIndex: 'pv', width: 72 },
                  ]}
                />
              </div>
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card className="chart-card equal-card" bordered title="流量来源">
              <div className="equal-card-body">
                <Table
                  className="utility-table"
                  size="small"
                  pagination={false}
                  rowKey="host"
                  dataSource={(sources?.ranking ?? []).slice(0, 10)}
                  columns={[
                    {
                      title: 'Source',
                      dataIndex: 'host',
                      render: (host: string) => (
                        <span className="source-host-cell">
                          <SiteFavicon host={host} size={16} />
                          <span className="source-host-text">
                            {hostLabel(host)}
                          </span>
                        </span>
                      ),
                    },
                    { title: 'Views', dataIndex: 'pv', width: 72 },
                  ]}
                />
              </div>
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card className="chart-card equal-card" bordered title="热门 IP">
              <div className="equal-card-body">
                <Table
                  className="utility-table"
                  size="small"
                  pagination={false}
                  rowKey="ip"
                  dataSource={(ips?.ranking ?? []).slice(0, 10)}
                  columns={[
                    {
                      title: 'IP',
                      dataIndex: 'ip',
                      ellipsis: true,
                      render: (ip: string) => <code>{ip}</code>,
                    },
                    { title: 'Views', dataIndex: 'pv', width: 72 },
                  ]}
                />
              </div>
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  );
}
