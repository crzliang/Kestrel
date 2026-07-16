import { useEffect, useState } from 'react';
import { Alert, Card, Col, Row, Table, Spin } from 'antd';
import ReactECharts from 'echarts-for-react';
import PageHeader from '../components/PageHeader';
import { fetchSources } from '../services/api';
import { useSiteStore } from '../store/site';
import { useThemeStore } from '../store/theme';
import type { SourceStats } from '@kestrel/shared';

const LABELS: Record<string, string> = {
  direct: '直接访问',
  search: '搜索引擎',
  social: '社交媒体',
  email: '邮件',
  referral: '外部引荐',
  unknown: '未知',
};

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
        data: (data?.ranking ?? []).map((r) => ({
          name: LABELS[r.source] ?? r.source,
          value: r.pv,
        })),
      },
    ],
  };

  return (
    <div className="page">
      <PageHeader
        title="来源分析"
        description="今日流量按直接访问、搜索、社交与外链分类。"
      />
      {error && (
        <Alert type="warning" showIcon message={error} style={{ marginBottom: 16 }} />
      )}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card className="chart-card" bordered>
            <Spin spinning={loading}>
              <ReactECharts option={pie} style={{ height: 320 }} />
            </Spin>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card className="chart-card" bordered title="来源排行">
            <Table
              className="utility-table"
              size="small"
              pagination={false}
              rowKey="source"
              dataSource={data?.ranking ?? []}
              columns={[
                {
                  title: '来源',
                  dataIndex: 'source',
                  render: (s: string) => LABELS[s] ?? s,
                },
                { title: 'PV', dataIndex: 'pv', width: 80 },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
