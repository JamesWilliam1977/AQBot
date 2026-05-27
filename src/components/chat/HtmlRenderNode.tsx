import { useMemo, useState } from 'react';
import { Button, Typography, theme } from 'antd';
import { Code, Eye } from 'lucide-react';
import type { NodeComponentProps } from 'markstream-react';
import { sanitizeHtmlContent } from 'stream-markdown-parser';
import { getHtmlRenderInnerContent } from '@/lib/chatHtmlRender';

type HtmlRenderNodeData = {
  type: 'html-render';
  content?: string;
  raw?: string;
  loading?: boolean;
};

type HtmlRenderNodeProps =
  | NodeComponentProps<HtmlRenderNodeData>
  | { node: HtmlRenderNodeData };

function getNode(props: HtmlRenderNodeProps) {
  return props.node;
}

export function HtmlRenderNode(props: HtmlRenderNodeProps) {
  const { token } = theme.useToken();
  const node = getNode(props);
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const html = useMemo(() => getHtmlRenderInnerContent(node), [node]);
  const safeHtml = useMemo(() => sanitizeHtmlContent(html), [html]);

  return (
    <div
      className="aqbot-html-render"
      style={{
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        background: token.colorBgContainer,
        maxWidth: '100%',
        overflow: 'hidden',
        margin: '8px 0',
      }}
    >
      <div
        className="aqbot-html-render-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '6px 8px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorFillQuaternary,
        }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          HTML Render
        </Typography.Text>
        <div style={{ display: 'inline-flex', gap: 4 }}>
          <Button
            size="small"
            type={mode === 'preview' ? 'primary' : 'text'}
            icon={<Eye size={14} />}
            onClick={() => setMode('preview')}
          >
            预览
          </Button>
          <Button
            size="small"
            type={mode === 'source' ? 'primary' : 'text'}
            icon={<Code size={14} />}
            onClick={() => setMode('source')}
          >
            源码
          </Button>
        </div>
      </div>
      {mode === 'preview' ? (
        <div
          data-testid="html-render-preview"
          style={{
            maxWidth: '100%',
            overflow: 'auto',
            padding: 12,
            contain: 'layout paint style',
          }}
          dangerouslySetInnerHTML={{ __html: safeHtml }}
        />
      ) : (
        <pre
          data-testid="html-render-source"
          style={{
            margin: 0,
            padding: 12,
            maxWidth: '100%',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 12,
            background: token.colorFillQuaternary,
          }}
        >
          {html}
        </pre>
      )}
    </div>
  );
}

export default HtmlRenderNode;
