import { describe, expect, it } from 'vitest';
import type { Message } from '@/types';
import {
  buildContextualSearchQuery,
  buildSearchQueryTag,
  buildSearchTag,
  formatSearchContent,
  parseSearchContent,
} from '../searchUtils';

function makeMessage(overrides: Partial<Message> & Pick<Message, 'id' | 'role' | 'content'>): Message {
  return {
    id: overrides.id,
    conversation_id: 'conv-1',
    role: overrides.role,
    content: overrides.content,
    provider_id: overrides.provider_id ?? null,
    model_id: overrides.model_id ?? null,
    token_count: overrides.token_count ?? null,
    prompt_tokens: overrides.prompt_tokens ?? null,
    completion_tokens: overrides.completion_tokens ?? null,
    attachments: overrides.attachments ?? [],
    thinking: overrides.thinking ?? null,
    tool_calls_json: overrides.tool_calls_json ?? null,
    tool_call_id: overrides.tool_call_id ?? null,
    created_at: overrides.created_at ?? 1,
    parent_message_id: overrides.parent_message_id ?? null,
    version_index: overrides.version_index ?? 0,
    is_active: overrides.is_active ?? true,
    status: overrides.status ?? 'complete',
    tokens_per_second: overrides.tokens_per_second ?? null,
    first_token_latency_ms: overrides.first_token_latency_ms ?? null,
  };
}

describe('buildContextualSearchQuery', () => {
  it('combines recent conversation context with the current follow-up question', () => {
    const query = buildContextualSearchQuery([
      makeMessage({
        id: 'user-1',
        role: 'user',
        content: '我想修改网站权限，让浏览器允许访问某个页面。',
      }),
      makeMessage({
        id: 'assistant-1',
        role: 'assistant',
        content: '可以在浏览器站点设置里调整权限。',
      }),
    ], '我已经给你权限了，继续怎么操作？');

    expect(query).toContain('我想修改网站权限');
    expect(query).toContain('浏览器站点设置');
    expect(query).toContain('我已经给你权限了，继续怎么操作？');
  });

  it('uses the previous user search intent instead of current permission meta instructions', () => {
    const query = buildContextualSearchQuery([
      makeMessage({
        id: 'user-1',
        role: 'user',
        content: '帮我搜索 AQBot Desktop 0.0.76 Windows 下载地址。',
      }),
      makeMessage({
        id: 'assistant-1',
        role: 'assistant',
        content: '需要联网搜索才能确认下载地址。',
      }),
    ], '没事，给你权限了，你可以搜索和打开任何网页了');

    expect(query).toContain('AQBot Desktop 0.0.76 Windows 下载地址');
    expect(query).not.toContain('给你权限');
    expect(query).not.toContain('打开任何网页');
    expect(query).not.toContain('联网搜索才能确认');
  });

  it('strips old search, RAG, think, and MCP display content from history', () => {
    const oldSearchContent = formatSearchContent([
      {
        title: '旧搜索标题',
        url: 'https://example.com/old-search',
        content: 'OLD_SEARCH_BODY_SHOULD_NOT_APPEAR',
      },
    ], '上一轮原始问题');
    const assistantDisplay = [
      buildSearchTag('done', [
        {
          title: '助手搜索卡片',
          url: 'https://example.com/card',
          content: 'ASSISTANT_SEARCH_CARD_SHOULD_NOT_APPEAR',
        },
      ]),
      '<knowledge-retrieval status="done" data-aqbot="1">KB_SHOULD_NOT_APPEAR</knowledge-retrieval>',
      '<memory-retrieval status="done" data-aqbot="1">MEMORY_SHOULD_NOT_APPEAR</memory-retrieval>',
      '<think>THINK_SHOULD_NOT_APPEAR</think>',
      ':::mcp call\nMCP_SHOULD_NOT_APPEAR\n:::\n',
      '上一轮最终回答',
    ].join('\n\n');

    const query = buildContextualSearchQuery([
      makeMessage({ id: 'user-1', role: 'user', content: oldSearchContent }),
      makeMessage({ id: 'assistant-1', role: 'assistant', content: assistantDisplay }),
    ], '继续搜索这个主题');

    expect(query).toContain('上一轮原始问题');
    expect(query).toContain('上一轮最终回答');
    expect(query).toContain('继续搜索这个主题');
    expect(query).not.toContain('OLD_SEARCH_BODY_SHOULD_NOT_APPEAR');
    expect(query).not.toContain('https://example.com/old-search');
    expect(query).not.toContain('ASSISTANT_SEARCH_CARD_SHOULD_NOT_APPEAR');
    expect(query).not.toContain('KB_SHOULD_NOT_APPEAR');
    expect(query).not.toContain('MEMORY_SHOULD_NOT_APPEAR');
    expect(query).not.toContain('THINK_SHOULD_NOT_APPEAR');
    expect(query).not.toContain('MCP_SHOULD_NOT_APPEAR');
  });

  it('returns the current question when there is no usable history', () => {
    const query = buildContextualSearchQuery([
      makeMessage({ id: 'system-1', role: 'system', content: 'system prompt' }),
      makeMessage({ id: 'error-1', role: 'assistant', content: 'broken', status: 'error' }),
      makeMessage({ id: 'partial-1', role: 'assistant', content: 'loading', status: 'partial' }),
    ], '当前问题');

    expect(query).toBe('当前问题');
  });

  it('limits context size and only uses the latest six complete user or assistant messages', () => {
    const messages = Array.from({ length: 8 }, (_, index) => makeMessage({
      id: `message-${index + 1}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `历史消息${index + 1} ${'很长的上下文'.repeat(80)}`,
      created_at: index + 1,
    }));

    const query = buildContextualSearchQuery(messages, `当前问题 ${'需要检索'.repeat(200)}`);

    expect(query).not.toContain('历史消息1');
    expect(query).not.toContain('历史消息2');
    expect(query).toContain('历史消息3');
    expect(query).toContain('历史消息8');
    expect(query).toContain('当前问题');
    expect(query.length).toBeLessThanOrEqual(1800);
  });
});

describe('buildSearchTag', () => {
  it('renders summarizing status and escapes summarized query attributes', () => {
    expect(buildSearchQueryTag('summarizing')).toContain('status="summarizing"');

    const tag = buildSearchQueryTag('done', 'AQBot "Windows" <download>');

    expect(tag).toContain('status="done"');
    expect(tag).toContain('query="AQBot &quot;Windows&quot; &lt;download&gt;"');
  });

  it('renders query summary failure details', () => {
    const tag = buildSearchQueryTag('error', undefined, '模型返回 <empty>');

    expect(tag).toContain('status="error"');
    expect(tag).toContain('模型返回 &lt;empty&gt;');
  });
});

describe('search content metadata', () => {
  it('stores and parses the summarized search query without changing displayed user content', () => {
    const content = formatSearchContent([
      {
        title: 'AQBot Release',
        url: 'https://example.com/aqbot',
        content: 'download',
      },
    ], '原始问题', {
      query: 'AQBot Desktop 下载',
    });

    const parsed = parseSearchContent(content);

    expect(parsed.query).toBe('AQBot Desktop 下载');
    expect(parsed.userContent).toBe('原始问题');
  });
});
