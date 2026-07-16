import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Card, Col, Row, Spin, Table } from 'antd';
import ReactECharts from 'echarts-for-react';
import PageHeader from '../components/PageHeader';
import SiteFavicon from '../components/SiteFavicon';
import TrendRangeControl, {
  rangeLabel,
  toTrendQuery,
  type TrendRangeValue,
} from '../components/TrendRangeControl';
import Sparkline from '../components/Sparkline';
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
import {
  ALL_SITES_LABEL,
  isAllSites,
} from '../constants/sites';
import {
  mergeNamedRanking,
  mergeTrendPoints,
} from '../utils/aggregateStats';
import { siteHref } from '../utils/siteRoutes';
import type {
  RealtimeStats,
  PageStats,
  SourceStats,
  IpStats,
  Site,
} from '@kestrel/shared';

function hostLabel(host: string) {
  return !host || host === '(direct)' ? '直接访问' : host;
}

type SiteBoardRow = {
  site: Site;
  online: number;
  pvToday: number;
  spark: number[];
};

export default function DashboardPage() {
  const siteId = useSiteStore((s) => s.siteId);
  const sites = useSiteStore((s) => s.sites);
  const sparklines = useSiteStore((s) => s.sparklines);
  const setSiteId = useSiteStore((s) => s.setSiteId);
  const navigate = useNavigate();
  const mode = useThemeStore((s) => s.mode);
  const allMode = isAllSites(siteId);
  const siteName = allMode
    ? ALL_SITES_LABEL
    : (sites.find((s) => s.id === siteId)?.name ?? siteId);

  const [range, setRange] = useState<TrendRangeValue>({ preset: '30d' });
  const [realtime, setRealtime] = useState<RealtimeStats | null>(null);
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [pages, setPages] = useState<PageStats | null>(null);
  const [sources, setSources] = useState<SourceStats | null>(null);
  const [ips, setIps] = useState<IpStats | null>(null);
  const [siteRows, setSiteRows] = useState<SiteBoardRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const trendQuery = useMemo(() => toTrendQuery(range), [range]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const loadOne = async (id: string) => {
      const [rt, trend, pageRes, sourceRes, ipRes] = await Promise.all([
        fetchRealtime(id),
        fetchTrend(id, trendQuery).catch(() => ({ points: [] as TrendPoint[] })),
        fetchPages(id, 10).catch(() => null),
        fetchSources(id).catch(() => null),
        fetchIps(id, 10).catch(() => null),
      ]);
      return { rt, trend, pageRes, sourceRes, ipRes };
    };

    const load = async () => {
      try {
        if (allMode) {
          if (sites.length === 0) {
            if (!cancelled) {
              setRealtime({ siteId: '__all__', pvToday: 0, online: 0, ts: Date.now() });
              setPoints([]);
              setPages(null);
              setSources(null);
              setIps(null);
              setSiteRows([]);
              setError(null);
            }
            return;
          }

          const results = await Promise.all(
            sites.map(async (site) => {
              try {
                const data = await loadOne(site.id);
                return { site, ok: true as const, data };
              } catch {
                return { site, ok: false as const };
              }
            }),
          );

          const ok = results.filter((r) => r.ok);
          const online = ok.reduce((s, r) => s + r.data.rt.online, 0);
          const pvToday = ok.reduce((s, r) => s + r.data.rt.pvToday, 0);
          const mergedPoints = mergeTrendPoints(
            ok.map((r) => r.data.trend.points),
          );
          const pageRanking = mergeNamedRanking(
            ok.map((r) => r.data.pageRes?.ranking ?? []),
            (row) => row.path,
            10,
          );
          const sourceRanking = mergeNamedRanking(
            ok.map((r) => r.data.sourceRes?.ranking ?? []),
            (row) => row.host,
            10,
          );
          const ipRanking = mergeNamedRanking(
            ok.map((r) => r.data.ipRes?.ranking ?? []),
            (row) => row.ip,
            10,
          );

          if (!cancelled) {
            setRealtime({
              siteId: '__all__',
              online,
              pvToday,
              ts: Date.now(),
            });
            setPoints(mergedPoints);
            setPages({
              siteId: '__all__',
              date: '',
              pages: {},
              ranking: pageRanking,
              ts: Date.now(),
            });
            setSources({
              siteId: '__all__',
              date: '',
              hosts: {},
              sources: {},
              ranking: sourceRanking,
              ts: Date.now(),
            });
            setIps({
              siteId: '__all__',
              date: '',
              ips: {},
              ranking: ipRanking,
              ts: Date.now(),
            });
            setSiteRows(
              ok
                .map((r) => ({
                  site: r.site,
                  online: r.data.rt.online,
                  pvToday: r.data.rt.pvToday,
                  spark: sparklines[r.site.id] ?? r.data.trend.points.slice(-7).map((p) => p.pv),
                }))
                .sort((a, b) => b.pvToday - a.pvToday),
            );
            setError(null);
          }
        } else {
          const { rt, trend, pageRes, sourceRes, ipRes } = await loadOne(siteId);
          if (!cancelled) {
            setRealtime(rt);
            setPoints(trend.points);
            setPages(pageRes);
            setSources(sourceRes);
            setIps(ipRes);
            setSiteRows([]);
            setError(null);
          }
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
  }, [siteId, trendQuery, allMode, sites, sparklines]);

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
    <div className="page page-wide dashboard-page">
      <PageHeader
        title={allMode ? ALL_SITES_LABEL : '访问总览'}
        description={
          allMode
            ? `汇总 ${sites.length} 个站点的实时指标与访问趋势。`
            : `${siteName} 的实时指标与访问趋势。`
        }
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
              <span>{allMode ? '全部站点趋势' : '访问趋势'}</span>
              <TrendRangeControl value={range} onChange={setRange} />
            </div>
          }
          style={{ marginBottom: 16 }}
        >
          <ReactECharts option={chartOption} style={{ height: 280 }} notMerge />
        </Card>

        {allMode ? (
          <Card
            className="chart-card"
            bordered
            title="站点明细"
            style={{ marginBottom: 16 }}
          >
            <Table
              className="utility-table"
              size="middle"
              pagination={false}
              rowKey={(r) => r.site.id}
              dataSource={siteRows}
              locale={{ emptyText: '暂无站点数据' }}
              columns={[
                {
                  title: '站点',
                  key: 'site',
                  render: (_: unknown, row: SiteBoardRow) => (
                    <button
                      type="button"
                      className="site-board-jump"
                      onClick={() => {
                        setSiteId(row.site.id);
                        navigate(siteHref(row.site.id));
                      }}
                    >
                      <SiteFavicon host={row.site.domain || row.site.id} size={16} />
                      <span>
                        <strong>{row.site.name}</strong>
                        <span className="site-board-jump-sub">
                          {row.site.domain || row.site.id}
                        </span>
                      </span>
                    </button>
                  ),
                },
                {
                  title: '在线',
                  dataIndex: 'online',
                  width: 88,
                  render: (n: number) => n.toLocaleString(),
                },
                {
                  title: '今日 PV',
                  dataIndex: 'pvToday',
                  width: 110,
                  render: (n: number) => n.toLocaleString(),
                },
                {
                  title: '近 7 日',
                  key: 'spark',
                  width: 100,
                  render: (_: unknown, row: SiteBoardRow) => (
                    <Sparkline values={row.spark} width={72} height={22} />
                  ),
                },
              ]}
            />
          </Card>
        ) : null}

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
