import { useEffect, useState } from 'react';
import { Alert, Card, Table, Tag, Spin } from 'antd';
import PageHeader from '../components/PageHeader';
import { fetchBehavior } from '../services/api';
import { useSiteStore } from '../store/site';
import { countryMapName } from '../utils/geoNames';
import type { BehaviorEvent } from '@kestrel/shared';

const sourceColor: Record<string, string> = {
  direct: 'default',
  search: 'blue',
  social: 'purple',
  email: 'gold',
  referral: 'cyan',
  unknown: 'default',
};

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString();
}

export default function BehaviorPage() {
  const siteId = useSiteStore((s) => s.siteId);
  const [events, setEvents] = useState<BehaviorEvent[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const load = async () => {
      try {
        const res = await fetchBehavior(siteId, 50);
        if (!cancelled) {
          setEvents(res.events);
          setNote(res.note);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    timer = window.setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [siteId]);

  return (
    <div className="page">
      <PageHeader
        title="用户行为"
        description="近期访问明细：路径、来源、设备、国家与 IP 指纹（哈希，非明文）。"
        extra={<span className="live-pill">5s</span>}
      />
      {note && (
        <Alert type="info" showIcon message={note} style={{ marginBottom: 16 }} />
      )}
      {error && (
        <Alert
          type="warning"
          showIcon
          message="行为数据暂不可用"
          description={error}
          style={{ marginBottom: 16 }}
        />
      )}
      <Card className="chart-card" bordered>
        <Spin spinning={loading}>
          <Table
            className="utility-table"
            size="small"
            rowKey={(r) => `${r.receivedAt}-${r.visitorId}-${r.path}`}
            dataSource={events}
            pagination={{ pageSize: 20 }}
            scroll={{ x: 1100 }}
            columns={[
              {
                title: '时间',
                dataIndex: 'receivedAt',
                width: 170,
                render: (t: number) => fmtTime(t),
              },
              {
                title: '事件',
                dataIndex: 'eventType',
                width: 90,
                render: (t: string) => <Tag>{t}</Tag>,
              },
              { title: '页面', dataIndex: 'path', ellipsis: true },
              {
                title: '来源',
                dataIndex: 'source',
                width: 100,
                render: (s: string) => (
                  <Tag color={sourceColor[s] ?? 'default'}>{s}</Tag>
                ),
              },
              {
                title: '来源站',
                dataIndex: 'referrerHost',
                width: 140,
                ellipsis: true,
                render: (h: string) => h || '—',
              },
              {
                title: '国家',
                dataIndex: 'country',
                width: 110,
                render: (c: string) => `${countryMapName(c)} (${c})`,
              },
              {
                title: 'IP 指纹',
                dataIndex: 'ipHash',
                width: 120,
                render: (h: string) => <code>{h}</code>,
              },
              {
                title: '设备',
                key: 'device',
                width: 200,
                render: (_: unknown, r: BehaviorEvent) =>
                  `${r.device.type} · ${r.device.os} · ${r.device.browser}${
                    r.device.version ? ` ${r.device.version}` : ''
                  }`,
              },
              {
                title: '访客',
                dataIndex: 'visitorId',
                width: 120,
                ellipsis: true,
                render: (id: string) => <code>{id.slice(0, 10)}…</code>,
              },
            ]}
          />
        </Spin>
      </Card>
    </div>
  );
}
