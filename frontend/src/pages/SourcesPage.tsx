import { useEffect, useState } from 'react';
import { Alert, Card, Col, Row, Table, Tag, Spin } from 'antd';
import ReactECharts from 'echarts-for-react';
import PageHeader from '../components/PageHeader';
import SiteFavicon from '../components/SiteFavicon';
import { fetchSources } from '../services/api';
import { useSiteStore } from '../store/site';
import { useThemeStore } from '../store/theme';
import type { SourceStats } from '@kestrel/shared';

const CHANNEL_LABELS: Record<string, string> = {
  direct: '直接',
  search: '搜索',
  social: '社交',
  email: '邮件',
  referral: '外链',
  unknown: '其他',
};

function hostLabel(host: string) {
  return !host || host === '(direct)' ? '直接访问' : host;
}

export default function SourcesPage() {
  const siteId = useSiteStore((s) => s.siteId);
  const mode = useThemeStore((s) => s.mode);
  const [data, setData] = useState<SourceStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchSources(siteId);
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

  const ink = mode === 'dark' ? '#e5eef7' : '#0f172a';
  const muted = mode === 'dark' ? '#94a3b8' : '#64748b';
  const ranking = data?.ranking ?? [];
  const top = ranking.slice(0, 10);

  const pie = {
    tooltip: { trigger: 'item' },
    textStyle: { color: ink },
    color: ['#059669', '#2563eb', '#34d399', '#60a5fa', '#94a3b8', '#cbd5e1'],
    series: [
      {
        type: 'pie',
        radius: ['40%', '68%'],
        itemStyle: { borderRadius: 6, borderColor: 'transparent', borderWidth: 2 },
        label: { color: muted },
        data: top.map((r) => ({
          name: hostLabel(r.host),
          value: r.pv,
        })),
      },
    ],
  };

  return (
    <div className="page">
      <PageHeader
        title="来源分析"
        description="按具体来源站点统计今日流量，并显示网站图标。"
      />
      {error && (
        <Alert type="warning" showIcon message={error} style={{ marginBottom: 16 }} />
      )}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card className="chart-card" bordered title="来源占比（Top 10）">
            <Spin spinning={loading}>
              <ReactECharts option={pie} style={{ height: 320 }} />
            </Spin>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card className="chart-card" bordered title="来源站点">
            <Table
              className="utility-table"
              size="small"
              pagination={false}
              rowKey="host"
              loading={loading}
              dataSource={ranking}
              columns={[
                {
                  title: '来源站点',
                  dataIndex: 'host',
                  render: (host: string) => (
                    <span className="source-host-cell">
                      <SiteFavicon host={host} size={18} />
                      <span className="source-host-text">{hostLabel(host)}</span>
                    </span>
                  ),
                },
                {
                  title: '类型',
                  dataIndex: 'channel',
                  width: 72,
                  render: (c: string) => (
                    <Tag>{CHANNEL_LABELS[c] ?? c}</Tag>
                  ),
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
