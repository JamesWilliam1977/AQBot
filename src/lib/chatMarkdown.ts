import { getMarkdown, parseMarkdownToStructure, type BaseNode } from 'stream-markdown-parser';
import { normalizeHtmlRenderContent } from './chatHtmlRender';
import { normalizeThinkTagsForMarkdown } from './thinkTags';

export type ChatMarkdownNode = BaseNode;

export const CHAT_CUSTOM_HTML_TAGS = ['think', 'web-search-query', 'web-search', 'knowledge-retrieval', 'memory-retrieval', 'tool-call', 'html-render', 'img'] as const;

/**
 * Strip all aqbot-injected custom tags (with `data-aqbot="1"` attribute) and
 * MCP tool call fenced blocks (`:::mcp ... :::`) from content.
 * Used when copying message text so display-only tags don't pollute the clipboard.
 */
export function stripAqbotTags(content: string): string {
  return content
    .replace(/<think[^>]*>[\s\S]*?<\/think>\s*/g, '')
    .replace(/<web-search-query [^>]*data-aqbot="1"[^>]*>[\s\S]*?<\/web-search-query>\s*/g, '')
    .replace(/<knowledge-retrieval [^>]*data-aqbot="1"[^>]*>[\s\S]*?<\/knowledge-retrieval>\s*/g, '')
    .replace(/<memory-retrieval [^>]*data-aqbot="1"[^>]*>[\s\S]*?<\/memory-retrieval>\s*/g, '')
    .replace(/<web-search [^>]*data-aqbot="1"[^>]*>[\s\S]*?<\/web-search>\s*/g, '')
    .replace(/<tool-call [^>]*data-aqbot="1"[^>]*>[\s\S]*?<\/tool-call>\s*/g, '')
    .replace(/\n*:::mcp [^\n]*\n[\s\S]*?:::\n*/g, '\n')
    .trim();
}

const chatMarkdown = getMarkdown('aqbot-chat', {
  customHtmlTags: CHAT_CUSTOM_HTML_TAGS,
});

function unwrapStandaloneHtmlRenderNodes(nodes: ChatMarkdownNode[]) {
  return nodes.map((node) => {
    const children = (node as { children?: ChatMarkdownNode[] }).children;
    if (node.type === 'paragraph' && children?.length === 1 && children[0]?.type === 'html-render') {
      return children[0];
    }
    return node;
  });
}

export function parseChatMarkdown(content: string): ChatMarkdownNode[] {
  const nodes = parseMarkdownToStructure(normalizeHtmlRenderContent(normalizeThinkTagsForMarkdown(content), { final: true }), chatMarkdown, {
    customHtmlTags: [...CHAT_CUSTOM_HTML_TAGS],
    final: true,
  });
  return unwrapStandaloneHtmlRenderNodes(nodes);
}
