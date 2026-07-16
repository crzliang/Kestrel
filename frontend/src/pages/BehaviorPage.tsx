import { useEffect, useMemo, useState } from 'react';
import { Alert, Spin } from 'antd';
import PageHeader from '../components/PageHeader';
import SiteFavicon from '../components/SiteFavicon';
import { fetchBehavior } from '../services/api';
import { useSiteStore } from '../store/site';
import { countryMapName } from '../utils/geoNames';
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

function relativeTime(ts: number, now: number) {
  const sec = Math.max(0, Math.floor((now - ts) / 1000));
  if (sec < 8) return '刚刚';
  if (sec < 60) return `${sec}s 前`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m 前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h 前`;
  return new Date(ts).toLocaleString();
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

export default function BehaviorPage() {
  const siteId = useSiteStore((s) => s.siteId);
  const [events, setEvents] = useState<BehaviorEvent[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

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
          setNow(Date.now());
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

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  const stats = useMemo(() => summarize(events), [events]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (eventFilter !== 'all' && e.eventType !== eventFilter) return false;
      if (sourceFilter !== 'all' && e.source !== sourceFilter) return false;
      return true;
    });
  }, [events, eventFilter, sourceFilter]);

  return (
    <div className="page behavior-page">
      <PageHeader
        title="用户行为"
        description="实时访问流 · 路径 / 来源 / 设备 / 指纹"
        extra={<span className="live-pill">5s</span>}
      />

      <div className="behavior-metrics">
        <div className="behavior-metric">
          <span className="behavior-metric-label">近期事件</span>
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
        <div className="behavior-stage-glow" aria-hidden />
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
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`behavior-chip ${eventFilter === id ? 'active' : ''}`}
                onClick={() => setEventFilter(id)}
              >
                {label}
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
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`behavior-chip ${sourceFilter === id ? 'active' : ''}`}
                onClick={() => setSourceFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="behavior-count">
            显示 {filtered.length} / {events.length}
          </div>
        </div>

        <Spin spinning={loading && events.length === 0}>
          <ol className="behavior-feed">
            {filtered.length === 0 && !loading ? (
              <li className="behavior-empty">当前筛选下暂无事件</li>
            ) : null}
            {filtered.map((e, i) => {
              const host = e.referrerHost || '';
              const isDirect = !host || e.source === 'direct';
              return (
                <li
                  key={`${e.receivedAt}-${e.visitorId}-${e.path}-${i}`}
                  className="behavior-item"
                  style={{ animationDelay: `${Math.min(i, 14) * 28}ms` }}
                >
                  <div className="behavior-rail" aria-hidden>
                    <span className={`behavior-dot type-${e.eventType}`} />
                  </div>
                  <div className="behavior-card">
                    <div className="behavior-card-top">
                      <div className="behavior-path-block">
                        <span className={`behavior-type type-${e.eventType}`}>
                          {e.eventType}
                        </span>
                        <code className="behavior-path">{e.path || '/'}</code>
                      </div>
                      <time
                        className="behavior-time"
                        dateTime={new Date(e.receivedAt).toISOString()}
                        title={new Date(e.receivedAt).toLocaleString()}
                      >
                        {relativeTime(e.receivedAt, now)}
                      </time>
                    </div>

                    <div className="behavior-meta">
                      <span className={`behavior-pill source-${e.source}`}>
                        {SOURCE_LABEL[e.source] ?? e.source}
                      </span>
                      <span className="behavior-pill host">
                        <SiteFavicon
                          host={isDirect ? '(direct)' : host}
                          size={14}
                        />
                        <span>{isDirect ? '直接访问' : host}</span>
                      </span>
                      <span className="behavior-pill">
                        {countryMapName(e.country)}
                        <span className="mono">{e.country}</span>
                      </span>
                      <span className="behavior-pill device">
                        {e.device.type}
                        <span className="sep">·</span>
                        {e.device.os}
                        <span className="sep">·</span>
                        {e.device.browser}
                        {e.device.version ? (
                          <span className="mono ver"> {e.device.version}</span>
                        ) : null}
                      </span>
                    </div>

                    <div className="behavior-ids">
                      <span>
                        IP 指纹 <code>{e.ipHash}</code>
                      </span>
                      {e.uaFingerprint ? (
                        <span>
                          UA 指纹 <code>{e.uaFingerprint}</code>
                        </span>
                      ) : null}
                      <span>
                        访客 <code>{e.visitorId.slice(0, 12)}…</code>
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Spin>

        {note ? <p className="behavior-note">{note}</p> : null}
      </div>
    </div>
  );
}
