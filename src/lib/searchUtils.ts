import type { Message, SearchResultItem } from '@/types';

const SEARCH_MARKER_START = '<!-- search:';
const SEARCH_MARKER_END = ' -->';
const SEARCH_SEPARATOR = '\n---\n\n';
const SEARCH_CONTEXT_MESSAGE_LIMIT = 6;
const SEARCH_HISTORY_MESSAGE_CHAR_LIMIT = 240;
const SEARCH_TOTAL_CONTEXT_CHAR_LIMIT = 1200;
const SEARCH_CURRENT_CONTENT_CHAR_LIMIT = 500;

export interface SearchSourceTag {
  title: string;
  url: string;
}

interface SearchContentMetadata {
  sources: SearchSourceTag[];
  status?: SearchTagStatus;
  error?: string;
  query?: string;
  queryStatus?: SearchQueryStatus;
  queryError?: string;
}

interface FormatSearchContentOptions {
  query?: string;
  queryStatus?: SearchQueryStatus;
  queryError?: string;
  status?: SearchTagStatus;
  error?: string;
}

/**
 * Format search results + user content into a single enriched message.
 * The LLM sees natural-language context; the UI can parse the hidden marker.
 */
export function formatSearchContent(
  results: SearchResultItem[],
  userContent: string,
  options?: FormatSearchContentOptions,
): string {
  const sourceTags: SearchSourceTag[] = results.map((r) => ({
    title: r.title,
    url: r.url,
  }));
  const metadataPayload: SearchContentMetadata = { sources: sourceTags };
  const query = options?.query?.trim();
  if (query) {
    metadataPayload.query = query;
  }
  if (options?.queryStatus) {
    metadataPayload.queryStatus = options.queryStatus;
  }
  const queryError = options?.queryError?.trim();
  if (queryError) {
    metadataPayload.queryError = queryError;
  }
  if (options?.status) {
    metadataPayload.status = options.status;
  }
  const error = options?.error?.trim();
  if (error) {
    metadataPayload.error = error;
  }
  const metadata = JSON.stringify(metadataPayload);

  let block = `${SEARCH_MARKER_START}${metadata}${SEARCH_MARKER_END}\n`;
  if (options?.status === 'error') {
    block += `联网搜索失败：${error || '搜索失败'}\n\n`;
  } else if (results.length === 0) {
    block += '联网搜索未找到相关结果。\n\n';
  } else {
    block += '以下是与问题相关的网络搜索结果，请参考回答：\n\n';
    results.forEach((r, i) => {
      block += `${i + 1}. **${r.title}** - ${r.url}\n   ${r.content}\n\n`;
    });
  }

  return `${block}${SEARCH_SEPARATOR}${userContent}`;
}

/**
 * Build custom tags for markstream-react rendering.
 */
export type SearchTagStatus = 'summarizing' | 'searching' | 'done' | 'error';
export type SearchQueryStatus = 'summarizing' | 'done' | 'error';

interface BuildSearchTagOptions {
  query?: string;
  queryStatus?: SearchQueryStatus;
  queryError?: string;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildSearchTagAttrs(status: SearchTagStatus, options?: BuildSearchTagOptions): string {
  const query = options?.query?.trim();
  const queryAttr = query ? ` query="${escapeHtmlAttr(query)}"` : '';
  const queryStatusAttr = options?.queryStatus
    ? ` query-status="${escapeHtmlAttr(options.queryStatus)}"`
    : '';
  const queryError = options?.queryError?.trim();
  const queryErrorAttr = queryError ? ` query-error="${escapeHtmlAttr(queryError)}"` : '';
  return `status="${status}" data-aqbot="1"${queryAttr}${queryStatusAttr}${queryErrorAttr}`;
}

export function buildSearchTag(
  status: SearchTagStatus,
  results?: SearchResultItem[],
  message?: string,
  options?: BuildSearchTagOptions,
): string {
  if (status === 'summarizing' || status === 'searching') {
    return `<web-search ${buildSearchTagAttrs(status, options)}></web-search>`;
  }
  if (status === 'error') {
    return `<web-search ${buildSearchTagAttrs(status, options)}>${message ?? ''}</web-search>`;
  }
  const json = JSON.stringify(
    (results ?? []).map((r) => ({ title: r.title, url: r.url, content: r.content })),
  );
  return `<web-search ${buildSearchTagAttrs(status, options)}>\n${json}\n</web-search>\n\n`;
}

export function buildSearchQueryTag(
  status: SearchQueryStatus,
  query?: string,
  message?: string,
): string {
  const queryAttr = query?.trim() ? ` query="${escapeHtmlAttr(query.trim())}"` : '';
  return `<web-search-query status="${status}" data-aqbot="1"${queryAttr}>${message ? escapeHtmlText(message) : ''}</web-search-query>\n\n`;
}

function truncateChars(text: string, limit: number): string {
  const chars = Array.from(text);
  if (chars.length <= limit) return text;
  return chars.slice(0, limit).join('');
}

function stripSearchEnrichment(content: string): string {
  const trimmedStart = content.trimStart();
  if (!trimmedStart.startsWith(SEARCH_MARKER_START)) {
    return content;
  }

  const markerEndIdx = trimmedStart.indexOf(SEARCH_MARKER_END);
  if (markerEndIdx === -1) {
    return content;
  }

  const afterMarker = trimmedStart.substring(markerEndIdx + SEARCH_MARKER_END.length);
  const separatorIdx = afterMarker.indexOf(SEARCH_SEPARATOR);
  if (separatorIdx === -1) {
    return content;
  }

  return afterMarker.substring(separatorIdx + SEARCH_SEPARATOR.length);
}

function stripAqbotDisplayTags(content: string): string {
  return ['web-search-query', 'web-search', 'knowledge-retrieval', 'memory-retrieval'].reduce((next, tagName) => {
    const tagPattern = new RegExp(
      `<${tagName}\\b[^>]*data-aqbot=["']?1["']?[^>]*>[\\s\\S]*?<\\/${tagName}>`,
      'gi',
    );
    return next.replace(tagPattern, '\n');
  }, content);
}

function stripMcpBlocks(content: string): string {
  return content.replace(/(^|\n):::mcp[^\n]*\n[\s\S]*?\n:::\s*(?=\n|$)/gi, '\n');
}

function normalizeSearchText(content: string): string {
  return stripMcpBlocks(stripAqbotDisplayTags(stripSearchEnrichment(content)))
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSearchPermissionMetaInstruction(content: string): boolean {
  return /权限/.test(content)
    && /(你可以|可以).*(搜索|打开|访问).*(网页|网站|页面)/.test(content);
}

/**
 * Build a concise search query for follow-up questions by adding recent chat context.
 * The returned query is only used for the search provider; stored user content stays unchanged.
 */
export function buildContextualSearchQuery(
  messages: Message[],
  currentContent: string,
): string {
  const currentQuestion = truncateChars(
    normalizeSearchText(currentContent),
    SEARCH_CURRENT_CONTENT_CHAR_LIMIT,
  );
  const historyCandidates = messages
    .filter((message) => (
      (message.role === 'user' || message.role === 'assistant')
      && message.status === 'complete'
    ))
    .slice(-SEARCH_CONTEXT_MESSAGE_LIMIT);
  const perMessageLimit = historyCandidates.length > 0
    ? Math.floor(SEARCH_TOTAL_CONTEXT_CHAR_LIMIT / historyCandidates.length)
    : SEARCH_HISTORY_MESSAGE_CHAR_LIMIT;
  const historyParts = historyCandidates
    .map((message) => {
      const roleLabel = message.role === 'user' ? '用户' : '助手';
      const contentLimit = Math.max(
        1,
        Math.min(
          SEARCH_HISTORY_MESSAGE_CHAR_LIMIT,
          perMessageLimit - roleLabel.length - 1,
        ),
      );
      const content = truncateChars(normalizeSearchText(message.content), contentLimit);
      return content ? `${message.role === 'user' ? '用户' : '助手'}：${content}` : '';
    })
    .filter(Boolean);

  if (historyParts.length === 0) {
    return currentQuestion;
  }

  if (isSearchPermissionMetaInstruction(currentQuestion)) {
    const lastUser = [...historyCandidates]
      .reverse()
      .find((message) => message.role === 'user');
    const lastUserContent = lastUser
      ? truncateChars(normalizeSearchText(lastUser.content), SEARCH_CURRENT_CONTENT_CHAR_LIMIT)
      : '';
    if (lastUserContent) {
      return lastUserContent;
    }
  }

  const context = truncateChars(historyParts.join('\n'), SEARCH_TOTAL_CONTEXT_CHAR_LIMIT);
  return `对话上下文：\n${context}\n\n当前问题：${currentQuestion}`;
}

export function parseSearchContent(content: string): {
  hasSearch: boolean;
  sources: SearchSourceTag[];
  status: SearchTagStatus | null;
  error: string | null;
  query: string | null;
  queryStatus: SearchQueryStatus | null;
  queryError: string | null;
  userContent: string;
} {
  if (!content.startsWith(SEARCH_MARKER_START)) {
    return {
      hasSearch: false,
      sources: [],
      status: null,
      error: null,
      query: null,
      queryStatus: null,
      queryError: null,
      userContent: content,
    };
  }

  const markerEndIdx = content.indexOf(SEARCH_MARKER_END);
  if (markerEndIdx === -1) {
    return {
      hasSearch: false,
      sources: [],
      status: null,
      error: null,
      query: null,
      queryStatus: null,
      queryError: null,
      userContent: content,
    };
  }

  const jsonStr = content.substring(SEARCH_MARKER_START.length, markerEndIdx);
  let sources: SearchSourceTag[] = [];
  let status: SearchTagStatus | null = null;
  let error: string | null = null;
  let query: string | null = null;
  let queryStatus: SearchQueryStatus | null = null;
  let queryError: string | null = null;
  try {
    const data = JSON.parse(jsonStr);
    sources = data.sources ?? [];
    status = ['searching', 'done', 'error', 'summarizing'].includes(data.status)
      ? data.status
      : null;
    error = typeof data.error === 'string' && data.error.trim()
      ? data.error.trim()
      : null;
    query = typeof data.query === 'string' && data.query.trim()
      ? data.query.trim()
      : null;
    queryStatus = ['summarizing', 'done', 'error'].includes(data.queryStatus)
      ? data.queryStatus
      : null;
    queryError = typeof data.queryError === 'string' && data.queryError.trim()
      ? data.queryError.trim()
      : null;
  } catch {
    // corrupted marker – treat as no search
  }

  const separatorIdx = content.indexOf(SEARCH_SEPARATOR);
  const userContent =
    separatorIdx !== -1
      ? content.substring(separatorIdx + SEARCH_SEPARATOR.length)
      : content.substring(markerEndIdx + SEARCH_MARKER_END.length);

  return { hasSearch: true, sources, status, error, query, queryStatus, queryError, userContent };
}
