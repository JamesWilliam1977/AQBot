import { describe, expect, it } from 'vitest';
import {
  getStreamingLoadingState,
  hasAqbotDisplayContent,
  hasModelVisibleContent,
  THINKING_LOADING_MARKER,
  closeStreamingThinkBlock,
  isAssistantStreamingForRender,
  shouldRenderAssistantMarkdownFromContent,
  shouldShowInitialStreamingDots,
  splitLeadingAqbotDisplayContent,
  stripLeadingAqbotDisplayTags,
} from '../chatStreaming';

describe('chat streaming helpers', () => {
  it('derives bubble and footer loading state from stream progress and content presence', () => {
    expect(getStreamingLoadingState(true, '')).toEqual({
      bubbleLoading: true,
      footerLoading: false,
    });

    expect(getStreamingLoadingState(true, 'hello')).toEqual({
      bubbleLoading: false,
      footerLoading: true,
    });

    expect(getStreamingLoadingState(false, 'hello')).toEqual({
      bubbleLoading: false,
      footerLoading: false,
    });
  });

  it('keeps streamed assistant messages on the content renderer after completion', () => {
    expect(shouldRenderAssistantMarkdownFromContent(true, false)).toBe(true);
    expect(shouldRenderAssistantMarkdownFromContent(false, true)).toBe(true);
    expect(shouldRenderAssistantMarkdownFromContent(false, false)).toBe(false);
  });

  it('shows initial streaming dots for empty model content', () => {
    const stripDisplayTags = (content: string) => content
      .replace(/<knowledge-retrieval [^>]*data-aqbot="1"[^>]*>[\s\S]*?<\/knowledge-retrieval>\s*/g, '')
      .trim();

    expect(shouldShowInitialStreamingDots(true, '', stripDisplayTags)).toBe(true);
    expect(shouldShowInitialStreamingDots(true, '<knowledge-retrieval status="done" data-aqbot="1">[]</knowledge-retrieval>', stripDisplayTags)).toBe(true);
    expect(shouldShowInitialStreamingDots(true, 'answer', stripDisplayTags)).toBe(false);
    expect(shouldShowInitialStreamingDots(false, '', stripDisplayTags)).toBe(false);
  });

  it('ignores display-only tags when deciding whether model text exists', () => {
    const stripDisplayTags = (content: string) => content
      .replace(/<knowledge-retrieval [^>]*data-aqbot="1"[^>]*>[\s\S]*?<\/knowledge-retrieval>\s*/g, '')
      .replace(/<think[^>]*>[\s\S]*?<\/think>\s*/g, '')
      .trim();

    expect(hasModelVisibleContent(
      '<knowledge-retrieval status="done" data-aqbot="1">[]</knowledge-retrieval>',
      stripDisplayTags,
    )).toBe(false);
    expect(hasModelVisibleContent(
      '<knowledge-retrieval status="done" data-aqbot="1">[]</knowledge-retrieval>\n\nanswer',
      stripDisplayTags,
    )).toBe(true);
  });

  it('detects AQBot display tags independently from model text', () => {
    expect(hasAqbotDisplayContent(
      '<knowledge-retrieval status="done" data-aqbot="1">[]</knowledge-retrieval>',
    )).toBe(true);
    expect(hasAqbotDisplayContent('answer')).toBe(false);
  });

  it('splits leading AQBot display tags from streamed model text', () => {
    const knowledge = '<knowledge-retrieval status="done" data-aqbot="1">[]</knowledge-retrieval>\n\n';
    const memory = '<memory-retrieval status="done" data-aqbot="1">[]</memory-retrieval>\n\n';

    expect(splitLeadingAqbotDisplayContent(`${knowledge}${memory}answer`)).toEqual({
      prefix: `${knowledge}${memory}`,
      body: 'answer',
    });
    expect(splitLeadingAqbotDisplayContent(`answer\n${knowledge}`)).toEqual({
      prefix: '',
      body: `answer\n${knowledge}`,
    });
  });

  it('strips selected leading display tags while preserving other display prefixes', () => {
    const web = '<web-search status="done" data-aqbot="1">[]</web-search>\n\n';
    const query = '<web-search-query status="done" data-aqbot="1">query</web-search-query>\n\n';
    const knowledge = '<knowledge-retrieval status="done" data-aqbot="1">[]</knowledge-retrieval>\n\n';

    expect(stripLeadingAqbotDisplayTags(
      `${query}${web}${knowledge}answer`,
      ['knowledge-retrieval', 'memory-retrieval'],
    )).toBe(`${query}${web}answer`);
  });

  it('temporarily closes streamed native think blocks without dropping leading text', () => {
    const content = '<think>好的，用户让我讲个笑话。';

    expect(closeStreamingThinkBlock(content, true)).toBe(
      `<think>\n好的，用户让我讲个笑话。${THINKING_LOADING_MARKER}\n</think>\n\n`,
    );
  });

  it('does not alter completed, incomplete, or non-streaming think content', () => {
    expect(closeStreamingThinkBlock('<think>done</think>\n\nanswer', true)).toBe('<think>done</think>\n\nanswer');
    expect(closeStreamingThinkBlock('<thi', true)).toBe('<thi');
    expect(closeStreamingThinkBlock('<think>still thinking', false)).toBe('<think>still thinking');
  });

  it('temporarily closes streamed think blocks with attributes', () => {
    expect(closeStreamingThinkBlock('<think data-aqbot="1">\nreasoning', true)).toBe(
      `<think data-aqbot="1">\nreasoning${THINKING_LOADING_MARKER}\n</think>\n\n`,
    );
    expect(closeStreamingThinkBlock('<think totalMs="123">done</think>\n\nanswer', true)).toBe(
      '<think totalMs="123">done</think>\n\nanswer',
    );
  });

  it('keeps partial assistant messages on the streaming renderer even when ids differ', () => {
    expect(isAssistantStreamingForRender({
      isStreaming: true,
      messageId: 'real-message-id',
      streamingMessageId: 'temp-assistant-id',
      status: 'partial',
    })).toBe(true);
    expect(isAssistantStreamingForRender({
      isStreaming: true,
      messageId: 'real-message-id',
      streamingMessageId: 'temp-assistant-id',
      status: 'complete',
    })).toBe(false);
    expect(isAssistantStreamingForRender({
      isStreaming: false,
      messageId: 'real-message-id',
      streamingMessageId: 'temp-assistant-id',
      status: 'partial',
    })).toBe(false);
  });
});
