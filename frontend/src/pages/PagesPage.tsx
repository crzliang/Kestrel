import { useEffect, useState } from 'react';
import { Alert, Card, Table, Spin } from 'antd';
import PageHeader from '../components/PageHeader';
import { fetchPages } from '../services/api';
import { useSiteStore } from '../store/site';
import type { PageStats } from '@kestrel/shared';

export default function PagesPage() {
  const siteId = useSiteStore((s) => s.siteId);
  const [data, setData] = useState<PageStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchPages(siteId, 50);
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

  return (
    <div className="page">
      <PageHeader title="页面分析" description="今日各页面浏览量排行。" />
      {error && (
        <Alert type="warning" showIcon message={error} style={{ marginBottom: 16 }} />
      )}
      <Card className="chart-card" bordered>
        <Spin spinning={loading}>
          <Table
            className="utility-table"
            size="middle"
            rowKey="path"
            dataSource={data?.ranking ?? []}
            pagination={{ pageSize: 20 }}
            columns={[
              { title: '路径', dataIndex: 'path', ellipsis: true },
              { title: 'PV', dataIndex: 'pv', width: 100 },
            ]}
          />
        </Spin>
      </Card>
    </div>
  );
}
