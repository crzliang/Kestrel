import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Segmented, Spin } from 'antd';
import ReactECharts from 'echarts-for-react';
import PageHeader from '../components/PageHeader';
import SiteFavicon from '../components/SiteFavicon';
import Sparkline from '../components/Sparkline';
import { fetchRealtime, fetchTrend, type TrendPoint } from '../services/api';
import { useSiteStore } from '../store/site';
import { useThemeStore } from '../store/theme';
import { ALL_SITES_LABEL } from '../constants/sites';
import { mergeTrendPoints } from '../utils/aggregateStats';
import { siteHref } from '../utils/siteRoutes';
import type { Site } from '@kestrel/shared';

type SiteCard = {
  site: Site;
  online: number;
  pvToday: number;
  spark: number[];
};

type TrendDays = 7 | 30;

export default function WorkspaceBoard() {
  const sites = useSiteStore((s) => s.sites);
  const sparklines = useSiteStore((s) => s.sparklines);
  const setSiteId = useSiteStore((s) => s.setSiteId);
  const navigate = useNavigate();
  const mode = useThemeStore((s) => s.mode);

  const [days, setDays] = useState<TrendDays>(7);
  const [online, setOnline] = useState(0);
  const [pvToday, setPvToday] = useState(0);
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [cards, setCards] = useState<SiteCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const load = async () => {
      try {
        if (sites.length === 0) {
          if (!cancelled) {
            setOnline(0);
            setPvToday(0);
            setPoints([]);
            setCards([]);
            setError(null);
          }
          return;
        }

        const results = await Promise.all(
          sites.map(async (site) => {
            try {
              const [rt, trend] = await Promise.all([
                fetchRealtime(site.id),
                fetchTrend(site.id, days).catch(() => ({
                  points: [] as TrendPoint[],
                })),
              ]);
              return { site, ok: true as const, rt, trend };
            } catch {
              return { site, ok: false as const };
            }
          }),
        );

        const ok = results.filter((r) => r.ok);
        const nextOnline = ok.reduce((sum, r) => sum + r.rt.online, 0);
        const nextPv = ok.reduce((sum, r) => sum + r.rt.pvToday, 0);
        const merged = mergeTrendPoints(ok.map((r) => r.trend.points));
        const nextCards = ok
          .map((r) => ({
            site: r.site,
            online: r.rt.online,
            pvToday: r.rt.pvToday,
            spark:
              sparklines[r.site.id] ??
              r.trend.points.slice(-7).map((p) => p.pv),
          }))
          .sort((a, b) => b.pvToday - a.pvToday);

        if (!cancelled) {
          setOnline(nextOnline);
          setPvToday(nextPv);
          setPoints(merged);
          setCards(nextCards);
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
  }, [sites, days, sparklines]);

  const dark = mode === 'dark';
  const muted = dark ? '#94a3b8' : '#64748b';
  const line = dark ? '#1f2937' : '#e2e8f0';
  const ink = dark ? '#e5eef7' : '#0f172a';
  const area = dark ? 'rgba(52, 211, 153, 0.18)' : 'rgba(5, 150, 105, 0.14)';

  const chartOption = useMemo(
    () => ({
      color: ['#059669'],
      textStyle: { color: ink },
      tooltip: { trigger: 'axis' },
      grid: { left: 8, right: 8, top: 12, bottom: 4, containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: points.map((p) => p.date.slice(5)),
        axisLabel: {
          color: muted,
          fontSize: 10,
          interval: points.length > 20 ? 2 : 0,
          hideOverlap: true,
        },
        axisTick: { show: false },
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
          type: 'line',
          smooth: 0.25,
          symbol: 'none',
          lineStyle: { width: 2, color: '#059669' },
          areaStyle: { color: area },
          data: points.map((p) => p.pv),
        },
      ],
    }),
    [points, ink, muted, line, area],
  );

  const openSite = (id: string) => {
    setSiteId(id);
    navigate(siteHref(id));
  };

  const rangePv = points.reduce((sum, p) => sum + p.pv, 0);

  return (
    <div className="page page-wide workspace-board">
      <PageHeader
        title={ALL_SITES_LABEL}
        description={`工作区脉搏 · ${sites.length} 个站点`}
        extra={<span className="live-pill">Live</span>}
      />

      {error ? (
        <Alert
          type="warning"
          showIcon
          message="无法连接实时 API"
          description={`${error}（本地未部署 EdgeOne 时属正常）`}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Spin spinning={loading && cards.length === 0 && sites.length > 0}>
        <section className="workspace-pulse" aria-label="工作区汇总">
          <div className="workspace-pulse-item">
            <span className="workspace-pulse-label">当前在线</span>
            <strong className="workspace-pulse-value">
              {online.toLocaleString()}
            </strong>
          </div>
          <div className="workspace-pulse-item">
            <span className="workspace-pulse-label">今日 PV</span>
            <strong className="workspace-pulse-value">
              {pvToday.toLocaleString()}
            </strong>
          </div>
          <div className="workspace-pulse-item">
            <span className="workspace-pulse-label">站点</span>
            <strong className="workspace-pulse-value">
              {sites.length.toLocaleString()}
            </strong>
          </div>
        </section>

        <section className="workspace-sites" aria-label="站点对比">
          <div className="workspace-section-head">
            <h2 className="workspace-section-title">站点</h2>
            <span className="workspace-section-hint">按今日 PV 排序 · 点击进入</span>
          </div>

          {sites.length === 0 ? (
            <div className="workspace-empty">
              <p>还没有站点</p>
              <Link to="/sites" className="workspace-empty-link">
                去创建第一个
              </Link>
            </div>
          ) : (
            <div className="workspace-site-grid">
              {cards.map((card, index) => (
                <button
                  key={card.site.id}
                  type="button"
                  className="workspace-site-card"
                  style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}
                  onClick={() => openSite(card.site.id)}
                >
                  <span className="workspace-site-card-top">
                    <SiteFavicon
                      host={card.site.domain || card.site.id}
                      size={20}
                    />
                    <span className="workspace-site-card-id">
                      <strong>{card.site.name}</strong>
                      <span>{card.site.domain || card.site.id}</span>
                    </span>
                  </span>
                  <span className="workspace-site-card-stats">
                    <span>
                      <em>在线</em>
                      <b>{card.online.toLocaleString()}</b>
                    </span>
                    <span>
                      <em>今日</em>
                      <b>{card.pvToday.toLocaleString()}</b>
                    </span>
                  </span>
                  <Sparkline
                    className="workspace-site-card-spark"
                    values={card.spark}
                    width={120}
                    height={28}
                  />
                </button>
              ))}
            </div>
          )}
        </section>

        {sites.length > 0 ? (
          <section className="workspace-trend" aria-label="全部站点趋势">
            <div className="workspace-section-head">
              <div>
                <h2 className="workspace-section-title">总趋势</h2>
                <p className="workspace-section-hint">
                  近 {days} 日合计 PV {rangePv.toLocaleString()}
                </p>
              </div>
              <Segmented
                size="small"
                value={days}
                options={[
                  { label: '7 天', value: 7 },
                  { label: '30 天', value: 30 },
                ]}
                onChange={(v) => setDays(v as TrendDays)}
              />
            </div>
            <div className="workspace-trend-chart">
              <ReactECharts
                option={chartOption}
                style={{ height: 180 }}
                notMerge
              />
            </div>
          </section>
        ) : null}
      </Spin>
    </div>
  );
}
