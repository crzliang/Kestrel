import { useState } from 'react';

type FaviconProps = {
  host: string;
  size?: number;
};

/** Site favicon by hostname; falls back to letter avatar. */
export default function SiteFavicon({ host, size = 20 }: FaviconProps) {
  const [failed, setFailed] = useState(false);
  const isDirect = !host || host === '(direct)';
  const letter = isDirect ? 'D' : host.replace(/^www\./, '').slice(0, 1).toUpperCase();

  if (isDirect || failed) {
    return (
      <span
        className={`site-favicon-fallback${isDirect ? ' is-direct' : ''}`}
        style={{ width: size, height: size, fontSize: size * 0.55 }}
        aria-hidden
      >
        {letter}
      </span>
    );
  }

  return (
    <img
      className="site-favicon"
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
    />
  );
}
