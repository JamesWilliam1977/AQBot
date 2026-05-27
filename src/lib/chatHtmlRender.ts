const HTML_RENDER_START_MARKER = '<!-- html-render-start -->';
const HTML_RENDER_END_MARKER = '<!-- html-render-end -->';
const HTML_RENDER_OPEN_RE = /<html-render\b[^>]*>/gi;
const HTML_RENDER_TAG_RE = /<\/?html-render\b[^>]*>/gi;

export type HtmlRenderNormalizeOptions = {
  final?: boolean;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function findUnmatchedHtmlRenderStart(content: string) {
  let depth = 0;
  let unmatchedStart = -1;
  HTML_RENDER_TAG_RE.lastIndex = 0;

  for (;;) {
    const match = HTML_RENDER_TAG_RE.exec(content);
    if (!match) break;

    const raw = match[0].toLowerCase();
    if (raw.startsWith('</')) {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0) unmatchedStart = -1;
      }
      continue;
    }

    depth += 1;
    if (depth === 1) unmatchedStart = match.index;
  }

  return depth > 0 ? unmatchedStart : -1;
}

export function normalizeHtmlRenderMarkers(
  content: string,
  options: HtmlRenderNormalizeOptions = {},
) {
  if (!content.includes(HTML_RENDER_START_MARKER)) return content;

  const final = options.final ?? true;
  let index = 0;
  let result = '';

  for (;;) {
    const startIndex = content.indexOf(HTML_RENDER_START_MARKER, index);
    if (startIndex === -1) {
      result += content.slice(index);
      break;
    }

    const contentStart = startIndex + HTML_RENDER_START_MARKER.length;
    const endIndex = content.indexOf(HTML_RENDER_END_MARKER, contentStart);
    result += content.slice(index, startIndex);

    if (endIndex === -1) {
      result += final
        ? content.slice(startIndex)
        : `<html-render>${content.slice(contentStart)}`;
      break;
    }

    result += `<html-render>${content.slice(contentStart, endIndex)}</html-render>`;
    index = endIndex + HTML_RENDER_END_MARKER.length;
  }

  return result;
}

export function shouldFallbackIncompleteHtmlRender(
  content: string,
  options: HtmlRenderNormalizeOptions = {},
) {
  return Boolean(options.final) && findUnmatchedHtmlRenderStart(content) !== -1;
}

export function normalizeHtmlRenderContent(
  content: string,
  options: HtmlRenderNormalizeOptions = {},
) {
  const normalized = normalizeHtmlRenderMarkers(content, options);
  if (!shouldFallbackIncompleteHtmlRender(normalized, options)) {
    return normalized;
  }

  const startIndex = findUnmatchedHtmlRenderStart(normalized);
  if (startIndex === -1) return normalized;

  return `${normalized.slice(0, startIndex)}${escapeHtml(normalized.slice(startIndex))}`;
}

export function getHtmlRenderInnerContent(node: {
  content?: unknown;
  raw?: unknown;
}) {
  const content = String(node.content ?? '');
  if (content) return content;

  const raw = String(node.raw ?? '');
  const openMatch = raw.match(HTML_RENDER_OPEN_RE);
  if (!openMatch) return raw;

  return raw
    .replace(HTML_RENDER_OPEN_RE, '')
    .replace(/<\/html-render>\s*$/i, '');
}
