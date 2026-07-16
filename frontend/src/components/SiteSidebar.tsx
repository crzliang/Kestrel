import { useState } from 'react';
import { Button, Tooltip } from 'antd';
import { PlusOutlined, SettingOutlined } from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import type { Site } from '@kestrel/shared';
import Sparkline from './Sparkline';
import { useSettingsStore } from '../store/settings';

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

function BrandMark({ logoUrl }: { logoUrl: string }) {
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
  return <span className="brand-mark" aria-hidden />;
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

  return (
    <div className="site-sidebar">
      <Link to="/" className="brand">
        <BrandMark logoUrl={settings.logoUrl} />
        <div className="brand-text">
          <span className="brand-name">{settings.title}</span>
          {settings.subtitle ? (
            <span className="brand-sub">{settings.subtitle}</span>
          ) : null}
        </div>
      </Link>

      <div className="site-sidebar-label">
        <span>站点</span>
        <Tooltip title="新建 / 管理站点">
          <Link to="/sites">
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              aria-label="管理站点"
            />
          </Link>
        </Tooltip>
      </div>

      <div className="site-list" role="list">
        {loading && sites.length === 0 ? (
          <div className="site-list-empty">加载中…</div>
        ) : null}
        {!loading && sites.length === 0 ? (
          <div className="site-list-empty">
            暂无站点
            <Link to="/sites">去创建</Link>
          </div>
        ) : null}
        {sites.map((site) => {
          const active = site.id === siteId;
          return (
            <button
              key={site.id}
              type="button"
              role="listitem"
              className={`site-row${active ? ' is-active' : ''}`}
              onClick={() => onSelect(site.id)}
            >
              <span className="site-avatar">
                <SiteAvatar site={site} />
              </span>
              <span className="site-meta">
                <span className="site-name">{site.name}</span>
                <span className="site-domain">
                  {site.domain || site.id}
                </span>
              </span>
              <Sparkline
                className="site-spark"
                values={sparklines[site.id] ?? [2, 3, 2, 4, 3, 5, 4]}
              />
            </button>
          );
        })}
      </div>

      <div className="site-sidebar-foot">
        <Link
          to="/sites"
          className={`site-foot-link${location.pathname === '/sites' ? ' is-active' : ''}`}
        >
          <SettingOutlined />
          <span>站点管理</span>
        </Link>
        <Link
          to="/settings"
          className={`site-foot-link${location.pathname === '/settings' ? ' is-active' : ''}`}
        >
          <SettingOutlined />
          <span>系统设置</span>
        </Link>
      </div>
    </div>
  );
}
