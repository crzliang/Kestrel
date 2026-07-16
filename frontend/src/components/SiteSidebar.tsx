import { useMemo, useState } from 'react';
import { Input, Tooltip } from 'antd';
import {
  PlusOutlined,
  SettingOutlined,
  AppstoreOutlined,
  SearchOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import type { Site } from '@kestrel/shared';
import Sparkline from './Sparkline';
import { useSettingsStore } from '../store/settings';
import {
  ALL_SITES_ID,
  ALL_SITES_LABEL,
  isAllSites,
} from '../constants/sites';

type SiteSidebarProps = {
  sites: Site[];
  siteId: string;
  sparklines: Record<string, number[]>;
  loading?: boolean;
  onSelect: (id: string) => void;
};

function SiteAvatar({ site }: { site: Site }) {
  const [failed, setFailed] = useState(false);
  const domain = site.domain?.replace(/^https?:\/\//, '').split('/')[0];
  const letter = (site.name || site.id).slice(0, 1).toUpperCase();

  if (domain && !failed) {
    return (
      <img
        className="site-avatar-img"
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
        alt=""
        width={28}
        height={28}
        onError={() => setFailed(true)}
      />
    );
  }

  return <span className="site-avatar-letter">{letter}</span>;
}

function BrandMark({ logoUrl, title }: { logoUrl: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return (
      <img
        className="brand-logo"
        src={logoUrl}
        alt=""
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="brand-mark" aria-hidden>
      {(title || 'K').slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function SiteSidebar({
  sites,
  siteId,
  sparklines,
  loading,
  onSelect,
}: SiteSidebarProps) {
  const location = useLocation();
  const settings = useSettingsStore((s) => s.settings);
  const [query, setQuery] = useState('');
  const overviewActive =
    isAllSites(siteId) &&
    location.pathname !== '/sites' &&
    location.pathname !== '/settings';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.domain || '').toLowerCase().includes(q),
    );
  }, [sites, query]);

  return (
    <aside className="site-sidebar">
      <div className="site-sidebar-glow" aria-hidden />

      <Link to="/" className="brand">
        <BrandMark logoUrl={settings.logoUrl} title={settings.title} />
        <div className="brand-text">
          <span className="brand-name">{settings.title}</span>
          {settings.subtitle ? (
            <span className="brand-sub">{settings.subtitle}</span>
          ) : null}
        </div>
      </Link>

      <div className="site-sidebar-main">
        <div className="site-sidebar-section">
          <button
            type="button"
            className={`site-overview${overviewActive ? ' is-active' : ''}`}
            onClick={() => onSelect(ALL_SITES_ID)}
          >
            <span className="site-overview-icon" aria-hidden>
              <ApartmentOutlined />
            </span>
            <span className="site-overview-label">{ALL_SITES_LABEL}</span>
            {sites.length > 0 ? (
              <span className="site-overview-count">{sites.length}</span>
            ) : null}
          </button>
        </div>

        <div className="site-sidebar-toolbar">
          <div className="site-sidebar-heading">
            <span className="site-sidebar-label">站点</span>
            <span className="site-sidebar-count">{sites.length}</span>
          </div>
          <Tooltip title="管理站点">
            <Link to="/sites" className="site-sidebar-add" aria-label="管理站点">
              <PlusOutlined />
            </Link>
          </Tooltip>
        </div>

        {sites.length > 4 ? (
          <div className="site-sidebar-search">
            <SearchOutlined className="site-sidebar-search-icon" />
            <Input
              allowClear
              variant="borderless"
              placeholder="筛选站点"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="筛选站点"
            />
          </div>
        ) : null}

        <div className="site-list" role="list">
          {loading && sites.length === 0 ? (
            <div className="site-list-empty">加载中…</div>
          ) : null}
          {!loading && sites.length === 0 ? (
            <div className="site-list-empty">
              <p>还没有站点</p>
              <Link to="/sites" className="site-list-empty-link">
                去创建第一个
              </Link>
            </div>
          ) : null}
          {!loading && sites.length > 0 && filtered.length === 0 ? (
            <div className="site-list-empty">无匹配站点</div>
          ) : null}

          {filtered.map((site, index) => {
            const active = site.id === siteId;
            const spark = sparklines[site.id] ?? [2, 3, 2, 4, 3, 5, 4];
            return (
              <button
                key={site.id}
                type="button"
                role="listitem"
                className={`site-row${active ? ' is-active' : ''}`}
                style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
                onClick={() => onSelect(site.id)}
              >
                <span className="site-row-rail" aria-hidden />
                <span className="site-avatar">
                  <SiteAvatar site={site} />
                </span>
                <span className="site-meta">
                  <span className="site-name">{site.name}</span>
                  <span className="site-domain">{site.domain || site.id}</span>
                </span>
                <Sparkline
                  className="site-spark"
                  values={spark}
                  width={44}
                  height={18}
                />
              </button>
            );
          })}
        </div>
      </div>

      <nav className="site-sidebar-foot" aria-label="管理">
        <Link
          to="/sites"
          className={`site-foot-link${location.pathname === '/sites' ? ' is-active' : ''}`}
        >
          <AppstoreOutlined />
          <span>站点管理</span>
        </Link>
        <Link
          to="/settings"
          className={`site-foot-link${location.pathname === '/settings' ? ' is-active' : ''}`}
        >
          <SettingOutlined />
          <span>系统设置</span>
        </Link>
      </nav>
    </aside>
  );
}
