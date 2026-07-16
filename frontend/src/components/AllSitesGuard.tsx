import type { ReactNode } from 'react';
import { Alert, Button } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { ALL_SITES_LABEL, isAllSites } from '../constants/sites';
import { useSiteStore } from '../store/site';
import { parseSiteLocation, siteHref } from '../utils/siteRoutes';

/** Shown on site-scoped analysis pages when the workspace board is selected. */
export default function AllSitesGuard({
  children,
}: {
  children: ReactNode;
}) {
  const siteId = useSiteStore((s) => s.siteId);
  const sites = useSiteStore((s) => s.sites);
  const setSiteId = useSiteStore((s) => s.setSiteId);
  const navigate = useNavigate();
  const location = useLocation();
  const page = parseSiteLocation(location.pathname).page;

  if (!isAllSites(siteId)) return <>{children}</>;

  return (
    <div className="page">
      <Alert
        type="info"
        showIcon
        message={`当前在「${ALL_SITES_LABEL}」`}
        description="本页需要选择具体站点。可先回到总览查看全部汇总，或从侧栏点选一个站点。"
        action={
          <Button size="small" type="primary" onClick={() => navigate('/')}>
            打开默认看板
          </Button>
        }
        style={{ marginBottom: 16 }}
      />
      <div className="all-sites-pick">
        {sites.map((site) => (
          <button
            key={site.id}
            type="button"
            className="all-sites-pick-item"
            onClick={() => {
              setSiteId(site.id);
              navigate(siteHref(site.id, page));
            }}
          >
            <strong>{site.name}</strong>
            <span>{site.domain || site.id}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
