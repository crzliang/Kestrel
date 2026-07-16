import { useEffect, useState } from 'react';
import { Card, Col, Row, Table, Alert, Spin } from 'antd';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts/core';
import PageHeader from '../components/PageHeader';
import { fetchGeo } from '../services/api';
import { useSiteStore } from '../store/site';
import { useThemeStore } from '../store/theme';
import { countryMapName } from '../utils/geoNames';
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

  const seriesData = (data?.ranking ?? []).map((row) => ({
    name: countryMapName(row.country),
    value: row.pv,
  }));
  const maxPv = Math.max(1, ...seriesData.map((d) => d.value));
  const dark = mode === 'dark';

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: (p: { name?: string; value?: number }) =>
        `${p.name ?? ''}<br/>PV: ${p.value ?? 0}`,
    },
    visualMap: {
      min: 0,
      max: maxPv,
      left: 16,
      bottom: 24,
      text: ['高', '低'],
      textStyle: { color: dark ? '#94a3b8' : '#64748b' },
      inRange: {
        color: dark
          ? ['#0f172a', '#064e3b', '#059669', '#34d399']
          : ['#ecfdf8', '#6ee7b7', '#059669', '#064e3b'],
      },
      calculable: true,
    },
    series: [
      {
        name: '今日 PV',
        type: 'map',
        map: 'world',
        roam: true,
        emphasis: {
          label: { show: true },
          itemStyle: { areaColor: '#2563eb' },
        },
        itemStyle: {
          areaColor: dark ? '#1e293b' : '#f1f5f9',
          borderColor: dark ? '#334155' : '#cbd5e1',
        },
        data: seriesData,
      },
    ],
  };

  return (
    <div className="page">
      <PageHeader
        title="地图浏览"
        description="今日访客国家分布（仅国家码）。可拖拽、滚轮缩放。"
      />

      {error && (
        <Alert
          type="warning"
          showIcon
          message="地域数据暂不可用"
          description={error}
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card className="chart-card" bordered>
            <Spin spinning={loading || !mapOk}>
              {mapOk ? (
                <ReactECharts
                  option={option}
                  style={{ height: 480 }}
                  notMerge
                />
              ) : (
                <div style={{ height: 480 }} />
              )}
            </Spin>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card className="chart-card" bordered title="国家排行">
            <Table
              className="utility-table"
              size="small"
              pagination={false}
              rowKey="country"
              dataSource={data?.ranking ?? []}
              columns={[
                {
                  title: '国家',
                  dataIndex: 'country',
                  render: (c: string) => `${countryMapName(c)} (${c})`,
                },
                { title: 'PV', dataIndex: 'pv', width: 72 },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
