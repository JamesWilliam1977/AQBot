import { normalizeThinkTagsForMarkdown } from '@/lib/thinkTags';

export function getStreamingLoadingState(
  isStreaming: boolean,
  content: unknown,
): { bubbleLoading: boolean; footerLoading: boolean } {
  const hasContent = typeof content === 'string'
    ? content.trim().length > 0
    : Boolean(content);

  return {
    bubbleLoading: isStreaming && !hasContent,
    footerLoading: isStreaming && hasContent,
  };
}

export function shouldRenderAssistantMarkdownFromContent(
  isStreaming: boolean,
  streamedInCurrentSession: boolean,
): boolean {
  return isStreaming || streamedInCurrentSession;
}

export const THINKING_LOADING_MARKER = '<!--aqbot-thinking-loading-->';

export function closeStreamingThinkBlock(content: string, isStreaming: boolean): string {
  if (!isStreaming || content.includes(THINKING_LOADING_MARKER)) {
    return content;
  }

  let lastOpenIndex = -1;
  for (const match of content.matchAll(/<think\b[^>]*>/gi)) {
    lastOpenIndex = match.index ?? -1;
  }
  if (lastOpenIndex < 0) {
    return content;
  }

  let lastCloseIndex = -1;
  for (const match of content.matchAll(/<\/think\s*>/gi)) {
    lastCloseIndex = match.index ?? -1;
  }
  if (lastCloseIndex > lastOpenIndex) {
    return content;
  }

  return normalizeThinkTagsForMarkdown(`${content}${THINKING_LOADING_MARKER}\n</think>\n\n`);
}

export function isAssistantStreamingForRender(input: {
  isStreaming: boolean;
  messageId?: string | null;
  streamingMessageId?: string | null;
  status?: string | null;
}): boolean {
  if (!input.isStreaming || !input.messageId) {
    return false;
  }
  return input.messageId === input.streamingMessageId || input.status === 'partial';
}

export function hasModelVisibleContent(content: unknown, stripDisplayTags: (content: string) => string): boolean {
  if (typeof content !== 'string') {
    return Boolean(content);
  }
  return stripDisplayTags(content).trim().length > 0;
}

export function shouldShowInitialStreamingDots(
  isStreaming: boolean,
  content: unknown,
  stripDisplayTags: (content: string) => string,
): boolean {
  return isStreaming && !hasModelVisibleContent(content, stripDisplayTags);
}

export function hasAqbotDisplayContent(content: unknown): boolean {
  return typeof content === 'string'
    && /<(?:knowledge-retrieval|memory-retrieval|web-search-query|web-search)\b[^>]*data-aqbot=["']1["'][^>]*>/i.test(content);
}

const LEADING_AQBOT_DISPLAY_TAG_RE = /^\s*<(knowledge-retrieval|memory-retrieval|web-search-query|web-search)\b[^>]*data-aqbot=["']1["'][^>]*>[\s\S]*?<\/\1>\s*/i;

export function splitLeadingAqbotDisplayContent(content: string): { prefix: string; body: string } {
  let body = content;
  let prefix = '';

  for (;;) {
    const match = body.match(LEADING_AQBOT_DISPLAY_TAG_RE);
    if (!match) break;
    prefix += match[0];
    body = body.slice(match[0].length);
  }

  return { prefix, body };
}

export function stripLeadingAqbotDisplayTags(content: string, tagNames: string[]): string {
  const tagSet = new Set(tagNames);
  let body = content;
  let keptPrefix = '';

  for (;;) {
    const match = body.match(LEADING_AQBOT_DISPLAY_TAG_RE);
    if (!match) break;
    const tagName = match[1]?.toLowerCase();
    if (!tagName || !tagSet.has(tagName)) {
      keptPrefix += match[0];
    }
    body = body.slice(match[0].length);
  }

  return keptPrefix + body;
}
