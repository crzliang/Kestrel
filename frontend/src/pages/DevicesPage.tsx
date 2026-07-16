import { useEffect, useState } from 'react';
import { Alert, Card, Col, Row, Table, Spin } from 'antd';
import ReactECharts from 'echarts-for-react';
import PageHeader from '../components/PageHeader';
import { fetchDevices } from '../services/api';
import { useSiteStore } from '../store/site';
import { useThemeStore } from '../store/theme';
import type { DeviceStats } from '@kestrel/shared';

function barOption(
  title: string,
  rows: Array<{ name: string; pv: number }>,
  mode: 'light' | 'dark',
) {
  const ink = mode === 'dark' ? '#e5eef7' : '#0f172a';
  const muted = mode === 'dark' ? '#94a3b8' : '#64748b';
  const line = mode === 'dark' ? '#1f2937' : '#e2e8f0';
  return {
    title: { text: title, left: 0, textStyle: { fontSize: 13, color: muted, fontWeight: 500 } },
    tooltip: { trigger: 'axis' },
    grid: { left: 80, right: 20, top: 40, bottom: 24 },
    xAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: muted },
      splitLine: { lineStyle: { color: line } },
    },
    yAxis: {
      type: 'category',
      data: rows.map((r) => r.name).reverse(),
      axisLabel: { color: ink },
      axisLine: { lineStyle: { color: line } },
    },
    series: [
      {
        type: 'bar',
        data: rows.map((r) => r.pv).reverse(),
        itemStyle: { color: '#059669', borderRadius: [0, 6, 6, 0] },
      },
    ],
  };
}

export default function DevicesPage() {
  const siteId = useSiteStore((s) => s.siteId);
  const mode = useThemeStore((s) => s.mode);
  const [data, setData] = useState<DeviceStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchDevices(siteId);
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const ranking = data?.ranking ?? {
    os: [],
    browser: [],
    type: [],
    fingerprints: [],
  };

  return (
    <div className="page">
      <PageHeader
        title="设备分析"
        description="今日操作系统、浏览器与设备类型分布；明细含版本与 UA 指纹。"
      />
      {error && (
        <Alert type="warning" showIcon message={error} style={{ marginBottom: 16 }} />
      )}
      <Spin spinning={loading}>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={8}>
            <Card className="chart-card" bordered>
              <ReactECharts
                option={barOption('设备类型', ranking.type, mode)}
                style={{ height: 280 }}
              />
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card className="chart-card" bordered>
              <ReactECharts
                option={barOption('操作系统', ranking.os.slice(0, 8), mode)}
                style={{ height: 280 }}
              />
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card className="chart-card" bordered>
              <ReactECharts
                option={barOption('浏览器', ranking.browser.slice(0, 8), mode)}
                style={{ height: 280 }}
              />
            </Card>
          </Col>
        </Row>
        <Card
          className="chart-card"
          bordered
          title="流量明细"
          style={{ marginTop: 16 }}
        >
          <Table
            className="utility-table"
            size="small"
            pagination={false}
            rowKey="fingerprint"
            dataSource={ranking.fingerprints}
            columns={[
              { title: '浏览器', dataIndex: 'browser' },
              { title: '版本', dataIndex: 'version', width: 140 },
              {
                title: '指纹',
                dataIndex: 'fingerprint',
                width: 140,
                render: (fp: string) => <code>{fp}</code>,
              },
              { title: 'PV', dataIndex: 'pv', width: 80 },
            ]}
          />
        </Card>
      </Spin>
    </div>
  );
}
