import { useEffect, useMemo, useState } from 'react';
import { Alert, Spin, Table } from 'antd';
import PageHeader from '../components/PageHeader';
import SiteFavicon from '../components/SiteFavicon';
import TrendRangeControl, {
  rangeLabel,
  toTrendQuery,
  type TrendRangeValue,
} from '../components/TrendRangeControl';
import { fetchBehavior } from '../services/api';
import { useSiteStore } from '../store/site';
import { countryLabel } from '../utils/geoNames';
import type { BehaviorEvent } from '@kestrel/shared';

type EventFilter = 'all' | 'pageview' | 'click' | 'custom';
type SourceFilter = 'all' | 'direct' | 'search' | 'social' | 'referral' | 'email';

const SOURCE_LABEL: Record<string, string> = {
  direct: '直接',
  search: '搜索',
  social: '社交',
  email: '邮件',
  referral: '外链',
  unknown: '未知',
};

const PAGE_SIZE = 15;

function relativeTime(ts: number, now: number) {
  const sec = Math.max(0, Math.floor((now - ts) / 1000));
  if (sec < 8) return '刚刚';
  if (sec < 60) return `${sec}s 前`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m 前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h 前`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d 前`;
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

function summarize(events: BehaviorEvent[]) {
  const visitors = new Set(events.map((e) => e.visitorId));
  const pageviews = events.filter((e) => e.eventType === 'pageview').length;
  const clicks = events.filter((e) => e.eventType === 'click').length;

  const pathCount = new Map<string, number>();
  const sourceCount = new Map<string, number>();
  for (const e of events) {
    pathCount.set(e.path, (pathCount.get(e.path) ?? 0) + 1);
    sourceCount.set(e.source, (sourceCount.get(e.source) ?? 0) + 1);
  }

  const topPath = [...pathCount.entries()].sort((a, b) => b[1] - a[1])[0];
  const topSource = [...sourceCount.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    total: events.length,
    visitors: visitors.size,
    pageviews,
    clicks,
    topPath: topPath?.[0] ?? '—',
    topSource: topSource?.[0] ?? '—',
  };
}

function rangeIncludesToday(range: TrendRangeValue): boolean {
  if (range.preset === 'all' || range.preset === '7d' || range.preset === '30d') {
    return true;
  }
  if (range.preset === 'custom' && range.range?.[1]) {
    const end = range.range[1].endOf('day');
    return end.valueOf() >= Date.now() - 86_400_000;
  }
  return false;
}

export default function BehaviorPage() {
  const siteId = useSiteStore((s) => s.siteId);
  const [range, setRange] = useState<TrendRangeValue>({ preset: '7d' });
  const [events, setEvents] = useState<BehaviorEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [page, setPage] = useState(1);

  const trendQuery = useMemo(() => toTrendQuery(range), [range]);
  const label = rangeLabel(range);
  const live = rangeIncludesToday(range);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const load = async () => {
      try {
        const res = await fetchBehavior(siteId, {
          ...trendQuery,
          limit: 200,
        });
        if (!cancelled) {
          setEvents(res.events);
          setError(null);
          setNow(Date.now());
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    setLoading(true);
    void load();
    if (live) {
      timer = window.setInterval(() => void load(), 5000);
    }
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [siteId, trendQuery, live]);

  useEffect(() => {
    if (!live) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [live]);

  const stats = useMemo(() => summarize(events), [events]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (eventFilter !== 'all' && e.eventType !== eventFilter) return false;
      if (sourceFilter !== 'all' && e.source !== sourceFilter) return false;
      return true;
    });
  }, [events, eventFilter, sourceFilter]);

  useEffect(() => {
    setPage(1);
  }, [siteId, eventFilter, sourceFilter, trendQuery]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE) || 1);
    if (page > maxPage) setPage(maxPage);
  }, [filtered.length, page]);

  const pageFrom = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageTo = Math.min(page * PAGE_SIZE, filtered.length);

  return (
    <div className="page behavior-page">
      <PageHeader
        title="用户行为"
        description={`${label} · 路径 / 来源 / 设备 / IP`}
        extra={
          <div className="behavior-header-extra">
            <TrendRangeControl value={range} onChange={setRange} />
            {live ? <span className="live-pill">5s</span> : null}
          </div>
        }
      />

      <div className="behavior-metrics">
        <div className="behavior-metric">
          <span className="behavior-metric-label">区间事件</span>
          <span className="behavior-metric-value">{stats.total}</span>
          <span className="behavior-metric-sub">
            PV {stats.pageviews} · Click {stats.clicks}
          </span>
        </div>
        <div className="behavior-metric">
          <span className="behavior-metric-label">独立访客</span>
          <span className="behavior-metric-value accent-2">{stats.visitors}</span>
          <span className="behavior-metric-sub">按 visitorId 去重</span>
        </div>
        <div className="behavior-metric">
          <span className="behavior-metric-label">热门路径</span>
          <span className="behavior-metric-value path" title={stats.topPath}>
            {stats.topPath}
          </span>
          <span className="behavior-metric-sub">当前窗口内最高频</span>
        </div>
        <div className="behavior-metric">
          <span className="behavior-metric-label">主要来源</span>
          <span className="behavior-metric-value accent">
            {SOURCE_LABEL[stats.topSource] ?? stats.topSource}
          </span>
          <span className="behavior-metric-sub">渠道占比领先</span>
        </div>
      </div>

      {error && (
        <Alert
          type="warning"
          showIcon
          message="行为数据暂不可用"
          description={error}
          style={{ marginBottom: 16 }}
        />
      )}

      <div className="behavior-stage">
        <div className="behavior-toolbar">
          <div className="behavior-filters">
            <span className="behavior-filter-label">事件</span>
            {(
              [
                ['all', '全部'],
                ['pageview', 'Pageview'],
                ['click', 'Click'],
                ['custom', 'Custom'],
              ] as const
            ).map(([id, text]) => (
              <button
                key={id}
                type="button"
                className={`behavior-chip ${eventFilter === id ? 'active' : ''}`}
                onClick={() => setEventFilter(id)}
              >
                {text}
              </button>
            ))}
          </div>
          <div className="behavior-filters">
            <span className="behavior-filter-label">来源</span>
            {(
              [
                ['all', '全部'],
                ['direct', '直接'],
                ['search', '搜索'],
                ['social', '社交'],
                ['referral', '外链'],
                ['email', '邮件'],
              ] as const
            ).map(([id, text]) => (
              <button
                key={id}
                type="button"
                className={`behavior-chip ${sourceFilter === id ? 'active' : ''}`}
                onClick={() => setSourceFilter(id)}
              >
                {text}
              </button>
            ))}
          </div>
          <div className="behavior-count">
            {filtered.length === 0
              ? '暂无数据'
              : `本页 ${pageFrom}–${pageTo} · 共 ${filtered.length} 条`}
          </div>
        </div>

        <div className="behavior-table-wrap">
          <Spin spinning={loading && events.length === 0}>
            <Table
              className="utility-table behavior-table"
              size="small"
              rowKey={(r) => `${r.receivedAt}-${r.visitorId}-${r.path}-${r.ipHash}`}
              dataSource={filtered}
              pagination={{
                current: page,
                defaultPageSize: PAGE_SIZE,
                pageSize: PAGE_SIZE,
                total: filtered.length,
                size: 'small',
                showSizeChanger: false,
                showTotal: (total) => `共 ${total} 条`,
                onChange: (next) => setPage(next),
              }}
              scroll={{ x: 1180 }}
              locale={{ emptyText: '当前筛选下暂无事件' }}
              columns={[
                {
                  title: '时间',
                  dataIndex: 'receivedAt',
                  width: 168,
                  render: (t: number) => (
                    <time
                      className="behavior-time"
                      dateTime={new Date(t).toISOString()}
                      title={new Date(t).toLocaleString()}
                    >
                      {relativeTime(t, now)}
                    </time>
                  ),
                },
                {
                  title: '事件',
                  dataIndex: 'eventType',
                  width: 108,
                  render: (t: string) => (
                    <span className={`behavior-type type-${t}`}>{t}</span>
                  ),
                },
                {
                  title: '页面',
                  dataIndex: 'path',
                  ellipsis: true,
                  render: (path: string) => (
                    <code className="behavior-path">{path || '/'}</code>
                  ),
                },
                {
                  title: '来源',
                  dataIndex: 'source',
                  width: 88,
                  render: (s: string) => (
                    <span className={`behavior-pill source-${s}`}>
                      {SOURCE_LABEL[s] ?? s}
                    </span>
                  ),
                },
                {
                  title: '来源站',
                  dataIndex: 'referrerHost',
                  width: 160,
                  ellipsis: true,
                  render: (h: string, r: BehaviorEvent) => {
                    const host = h || '';
                    const isDirect = !host || r.source === 'direct';
                    return (
                      <span className="source-host-cell">
                        <SiteFavicon
                          host={isDirect ? '(direct)' : host}
                          size={14}
                        />
                        <span className="source-host-text">
                          {isDirect ? '直接访问' : host}
                        </span>
                      </span>
                    );
                  },
                },
                {
                  title: '国家',
                  dataIndex: 'country',
                  width: 140,
                  render: (c: string) => (
                    <span>{countryLabel(c)}</span>
                  ),
                },
                {
                  title: '设备',
                  key: 'device',
                  width: 200,
                  ellipsis: true,
                  render: (_: unknown, r: BehaviorEvent) =>
                    `${r.device.type} · ${r.device.os} · ${r.device.browser}${
                      r.device.version ? ` ${r.device.version}` : ''
                    }`,
                },
                {
                  title: 'IP',
                  dataIndex: 'ip',
                  width: 140,
                  ellipsis: true,
                  render: (ip: string, r: BehaviorEvent) => (
                    <code title={r.ipHash ? `指纹 ${r.ipHash}` : undefined}>
                      {ip || '—'}
                    </code>
                  ),
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
        </div>
      </div>
    </div>
  );
}
