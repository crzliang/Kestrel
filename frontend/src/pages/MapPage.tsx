import { useEffect, useMemo, useState } from 'react';
import { Alert, Spin } from 'antd';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts/core';
import PageHeader from '../components/PageHeader';
import { fetchGeo } from '../services/api';
import { useSiteStore } from '../store/site';
import { useThemeStore } from '../store/theme';
import { countryCentroid } from '../utils/geoCentroids';
import { countryLabel, countryMapName } from '../utils/geoNames';
import type { GeoStats } from '@kestrel/shared';

const WORLD_GEO_URL =
  'https://cdn.jsdelivr.net/npm/echarts@4.9.0/map/json/world.json';

let worldMapReady: Promise<void> | null = null;

function ensureWorldMap(): Promise<void> {
  if (!worldMapReady) {
    worldMapReady = fetch(WORLD_GEO_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`world map HTTP ${r.status}`);
        return r.json();
      })
      .then((geoJson) => {
        echarts.registerMap('world', geoJson);
      });
  }
  return worldMapReady;
}

function formatPv(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function MapPage() {
  const siteId = useSiteStore((s) => s.siteId);
  const mode = useThemeStore((s) => s.mode);
  const [data, setData] = useState<GeoStats | null>(null);
  const [mapOk, setMapOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    ensureWorldMap()
      .then(() => {
        if (!cancelled) setMapOk(true);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '地图底图加载失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const load = async () => {
      try {
        const next = await fetchGeo(siteId);
        if (!cancelled) {
          setData(next);
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

  const ranking = data?.ranking ?? [];
  const totalPv = useMemo(
    () => ranking.reduce((s, r) => s + r.pv, 0),
    [ranking],
  );
  const top = ranking[0];
  const dark = mode === 'dark';

  const option = useMemo(() => {
    const seriesData = ranking.map((row) => ({
      name: countryMapName(row.country),
      value: row.pv,
    }));
    const maxPv = Math.max(1, ...seriesData.map((d) => d.value));

    const scatterData = ranking
      .slice(0, 8)
      .map((row) => {
        const coord = countryCentroid(row.country);
        if (!coord) return null;
        return {
          name: countryMapName(row.country),
          value: [...coord, row.pv] as [number, number, number],
          iso: row.country,
        };
      })
      .filter(Boolean) as Array<{
      name: string;
      value: [number, number, number];
      iso: string;
    }>;

    const ink = dark ? '#e5eef7' : '#0f172a';
    const muted = dark ? '#94a3b8' : '#64748b';
    const land = dark ? '#151d2a' : '#e8eef5';
    const border = dark ? '#2a3648' : '#c5d0de';
    const accent = dark ? '#34d399' : '#059669';
    const accentHot = dark ? '#6ee7b7' : '#047857';

    return {
      backgroundColor: 'transparent',
      animationDuration: 800,
      animationEasingUpdate: 'cubicOut',
      tooltip: {
        trigger: 'item',
        backgroundColor: dark ? 'rgba(17, 24, 39, 0.94)' : 'rgba(255,255,255,0.96)',
        borderColor: dark ? '#334155' : '#e2e8f0',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: ink, fontSize: 13 },
        formatter: (p: {
          seriesType?: string;
          name?: string;
          value?: number | number[];
        }) => {
          const pv =
            typeof p.value === 'number'
              ? p.value
              : Array.isArray(p.value)
                ? Number(p.value[2] ?? 0)
                : 0;
          if (!pv) return `${p.name ?? ''}<br/><span style="color:${muted}">暂无访问</span>`;
          const share = totalPv > 0 ? ((pv / totalPv) * 100).toFixed(1) : '0';
          return `<div style="font-weight:600;margin-bottom:4px">${p.name ?? ''}</div>
            <div>PV <b style="color:${accent}">${pv}</b></div>
            <div style="color:${muted};font-size:12px;margin-top:2px">占比 ${share}%</div>`;
        },
      },
      geo: {
        map: 'world',
        roam: true,
        scaleLimit: { min: 0.8, max: 8 },
        zoom: 1.15,
        center: [12, 18],
        itemStyle: {
          areaColor: land,
          borderColor: border,
          borderWidth: 0.7,
        },
        emphasis: {
          label: { show: false },
          itemStyle: {
            areaColor: dark ? '#1e3a4f' : '#bfd4ea',
            borderColor: accent,
            borderWidth: 1,
          },
        },
        silent: false,
      },
      visualMap: {
        min: 0,
        max: maxPv,
        show: true,
        left: 20,
        bottom: 28,
        itemWidth: 10,
        itemHeight: 96,
        text: ['高', '低'],
        textGap: 8,
        textStyle: { color: muted, fontSize: 11 },
        inRange: {
          color: dark
            ? ['#1a2433', '#0f3d32', '#059669', '#34d399', '#a7f3d0']
            : ['#edf2f7', '#a7f3d0', '#34d399', '#059669', '#064e3b'],
        },
        calculable: true,
        realtime: true,
      },
      series: [
        {
          name: '今日 PV',
          type: 'map',
          geoIndex: 0,
          data: seriesData,
          selectedMode: false,
          animation: true,
        },
        {
          name: '热点',
          type: 'effectScatter',
          coordinateSystem: 'geo',
          data: scatterData,
          symbolSize: (val: number[]) => {
            const v = val[2] ?? 1;
            return Math.max(8, Math.min(22, 6 + (v / maxPv) * 18));
          },
          showEffectOn: 'render',
          rippleEffect: {
            brushType: 'stroke',
            scale: 3.2,
            period: 3.6,
            number: 2,
          },
          label: {
            show: true,
            formatter: (p: { name?: string; dataIndex?: number }) =>
              (p.dataIndex ?? 99) < 3 ? (p.name ?? '') : '',
            position: 'top',
            distance: 6,
            color: ink,
            fontSize: 11,
            fontWeight: 500,
          },
          itemStyle: {
            color: accent,
            shadowBlur: 12,
            shadowColor: dark ? 'rgba(52, 211, 153, 0.35)' : 'rgba(5, 150, 105, 0.35)',
          },
          emphasis: {
            scale: 1.15,
            itemStyle: { color: accentHot },
          },
          zlevel: 2,
        },
      ],
    };
  }, [ranking, dark, totalPv]);

  return (
    <div className="page map-page">
      <PageHeader
        title="地图浏览"
        description="全球访客热力 · 拖拽平移 · 滚轮缩放"
        extra={<span className="live-pill">8s</span>}
      />

      <div className="map-metrics">
        <div className="map-metric">
          <span className="map-metric-label">覆盖国家</span>
          <span className="map-metric-value">{ranking.length}</span>
        </div>
        <div className="map-metric">
          <span className="map-metric-label">今日 PV</span>
          <span className="map-metric-value">{formatPv(totalPv)}</span>
        </div>
        <div className="map-metric map-metric-top">
          <span className="map-metric-label">热度最高</span>
          <span className="map-metric-value">
            {top ? countryLabel(top.country) : '—'}
          </span>
          {top ? (
            <span className="map-metric-sub">
              {formatPv(top.pv)} PV
            </span>
          ) : null}
        </div>
      </div>

      {error && (
        <Alert
          type="warning"
          showIcon
          message="地域数据暂不可用"
          description={error}
          style={{ marginBottom: 16 }}
        />
      )}

      <div className="map-layout">
        <div className="map-stage">
          <div className="map-stage-glow" aria-hidden />
          <div className="map-stage-grid" aria-hidden />
          <Spin spinning={loading || !mapOk}>
            {mapOk ? (
              <ReactECharts
                option={option}
                style={{ height: 'min(62vh, 640px)', minHeight: 420 }}
                notMerge
                lazyUpdate
              />
            ) : (
              <div style={{ height: 'min(62vh, 640px)', minHeight: 420 }} />
            )}
          </Spin>
        </div>

        <aside className="map-rank">
          <div className="map-rank-head">
            <h2>国家排行</h2>
            <span>{ranking.length} 个地区</span>
          </div>
          <ol className="map-rank-list">
            {ranking.length === 0 && !loading ? (
              <li className="map-rank-empty">暂无地域数据</li>
            ) : null}
            {ranking.map((row, i) => {
              const share = totalPv > 0 ? (row.pv / totalPv) * 100 : 0;
              return (
                <li
                  key={row.country}
                  className="map-rank-item"
                  style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                >
                  <span className={`map-rank-idx ${i < 3 ? 'hot' : ''}`}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="map-rank-body">
                    <div className="map-rank-row">
                      <span className="map-rank-name">
                        {countryLabel(row.country)}
                      </span>
                      <span className="map-rank-pv">{row.pv}</span>
                    </div>
                    <div className="map-rank-bar">
                      <span style={{ width: `${Math.max(share, 2)}%` }} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}
