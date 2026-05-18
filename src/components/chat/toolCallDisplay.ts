import type { Message } from '@/types';
import { stripAqbotTags } from '@/lib/chatMarkdown';
import { buildSearchQueryTag, buildSearchTag, parseSearchContent } from '@/lib/searchUtils';
import { splitLeadingAqbotDisplayContent } from './chatStreaming';

function hasPersistedDisplayTag(content: string): boolean {
  return /<(?:web-search-query|web-search|knowledge-retrieval|memory-retrieval)\b[^>]*data-aqbot=["']1["'][^>]*>/i.test(content);
}

export function buildAssistantDisplayContent(message: Message, messages: Message[]): string {
  if (message.role !== 'assistant') {
    return message.content;
  }

  let content = message.content;
  if (message.status === 'error' || hasPersistedDisplayTag(content)) {
    return content;
  }

  const parent = message.parent_message_id
    ? messages.find((item) => item.id === message.parent_message_id && item.role === 'user')
    : undefined;
  if (!parent) {
    return content;
  }

  const parentSearch = parseSearchContent(parent.content);
  if (!parentSearch.hasSearch) {
    return content;
  }

  const queryTag = parentSearch.queryStatus || parentSearch.query
    ? buildSearchQueryTag(parentSearch.queryStatus ?? 'done', parentSearch.query ?? undefined, parentSearch.queryError ?? undefined)
    : '';
  const searchTag = buildSearchTag(
    parentSearch.status ?? 'done',
    parentSearch.sources.map((source) => ({ ...source, content: '' })),
    parentSearch.error ?? undefined,
  );
  content = `${queryTag}${searchTag}${content}`;
  return content;
}

export function splitAssistantErrorDisplayContent(content: string): { prefix: string; message: string } {
  const split = splitLeadingAqbotDisplayContent(content);
  const cleanBody = stripAqbotTags(split.body).trim();
  const cleanFullContent = stripAqbotTags(content).trim();

  return {
    prefix: split.prefix,
    message: cleanBody || cleanFullContent || split.body.trim() || content.trim(),
  };
}

export function shouldHideAssistantBubble(message: Message, displayContent: string): boolean {
  if (message.role !== 'assistant') {
    return false;
  }

  if (displayContent.trim()) {
    return false;
  }

  return !message.content.trim() && Boolean(message.tool_calls_json);
}
