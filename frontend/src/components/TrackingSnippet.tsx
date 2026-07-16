import { useMemo, useState, type ReactNode } from 'react';
import { Button, Tooltip, message } from 'antd';
import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import { trackingSnippet } from '../services/api';
import { isAllSites } from '../constants/sites';

type TrackingSnippetProps = {
  siteId: string;
  siteName?: string;
  siteDomain?: string;
  /** Tighter layout for modals */
  compact?: boolean;
};

function buildFormattedSnippet(siteId: string): {
  copyText: string;
  display: string;
} {
  const copyText = trackingSnippet(siteId);
  const origin = window.location.origin;
  const display = [
    '<script',
    '  defer',
    `  src="${origin}/kestrel.js?v=0.1.0"`,
    `  data-site="${siteId}"`,
    `  data-endpoint="${origin}/v1/track"`,
    '></script>',
  ].join('\n');
  return { copyText, display };
}

function HighlightedSnippet({ code }: { code: string }) {
  const lines = code.split('\n');
  return (
    <code className="snippet-code">
      {lines.map((line, i) => (
        <span key={i} className="snippet-line">
          <span className="snippet-gutter" aria-hidden>
            {i + 1}
          </span>
          <span className="snippet-line-body">{highlightLine(line)}</span>
        </span>
      ))}
    </code>
  );
}

function highlightLine(line: string): ReactNode {
  const indentMatch = line.match(/^(\s*)(.*)$/);
  const indent = indentMatch?.[1] ?? '';
  const body = indentMatch?.[2] ?? line;

  if (body.startsWith('<') || body.startsWith('</') || body === '></script>') {
    return <span className="tok-tag">{line}</span>;
  }
  if (body === 'defer') {
    return (
      <>
        {indent}
        <span className="tok-attr">{body}</span>
      </>
    );
  }
  const attr = body.match(/^([a-zA-Z0-9:-]+)(=")([^"]*)(")$/);
  if (attr) {
    const [, name, eq, value, quote] = attr;
    return (
      <>
        {indent}
        <span className="tok-attr">{name}</span>
        <span className="tok-punct">{eq}</span>
        <span className="tok-string">
          {quote}
          {value}
          {quote}
        </span>
      </>
    );
  }
  return line;
}

export default function TrackingSnippet({
  siteId,
  siteName,
  siteDomain,
  compact = false,
}: TrackingSnippetProps) {
  const [copied, setCopied] = useState(false);
  const invalid = !siteId || isAllSites(siteId);

  const { copyText, display } = useMemo(
    () =>
      invalid
        ? { copyText: '', display: '' }
        : buildFormattedSnippet(siteId),
    [invalid, siteId],
  );

  const onCopy = async () => {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      message.success('埋点代码已复制');
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      message.error('复制失败');
    }
  };

  if (invalid) {
    return (
      <div className="snippet-panel snippet-panel-empty">
        <p>请先在左侧选择一个具体站点，再复制对应的埋点代码。</p>
      </div>
    );
  }

  return (
    <div className={`snippet-panel${compact ? ' is-compact' : ''}`}>
      <div className="snippet-meta">
        <div className="snippet-meta-text">
          <span className="snippet-meta-label">埋点代码</span>
          <p>
            放入页面 <code>&lt;head&gt;</code> 或页脚
            {siteName ? (
              <>
                。站点 <strong>{siteName}</strong>
              </>
            ) : null}
            {siteDomain ? (
              <>
                {' '}
                · <span className="snippet-meta-domain">{siteDomain}</span>
              </>
            ) : null}
            ，data-site <code className="snippet-site-id">{siteId}</code>
          </p>
        </div>
        {!compact ? (
          <Button
            type="primary"
            icon={copied ? <CheckOutlined /> : <CopyOutlined />}
            onClick={() => void onCopy()}
          >
            {copied ? '已复制' : '复制代码'}
          </Button>
        ) : null}
      </div>

      <div className="snippet-editor">
        <div className="snippet-chrome">
          <span className="snippet-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="snippet-filename">kestrel-snippet.html</span>
          <Tooltip title={copied ? '已复制' : '复制到剪贴板'}>
            <button
              type="button"
              className="snippet-copy-ghost"
              onClick={() => void onCopy()}
            >
              {copied ? <CheckOutlined /> : <CopyOutlined />}
              {copied ? '已复制' : '复制'}
            </button>
          </Tooltip>
        </div>
        <pre className="snippet-pre">
          <HighlightedSnippet code={display} />
        </pre>
      </div>
    </div>
  );
}
