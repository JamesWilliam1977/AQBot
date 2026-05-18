import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WebSearchNode, WebSearchQueryNode } from '../WebSearchNode';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => ({
      'chat.search.searching': '正在联网搜索...',
      'chat.search.summarizingQuery': '正在总结搜索语句...',
      'chat.search.querySummary': '搜索语句总结完成',
      'chat.search.querySummaryFailed': '搜索语句总结失败',
      'chat.search.resultsCount': '1个搜索结果',
      'chat.search.noResults': '未找到相关搜索结果',
      'chat.search.query': '搜索语句',
      'chat.search.error': '搜索失败',
    })[key] ?? fallback ?? key,
  }),
}));

describe('WebSearchNode', () => {
  it('shows the searching state when attrs come from tuple pairs', () => {
    render(
      <WebSearchNode
        node={{
          type: 'web-search',
          attrs: [['status', 'searching']],
          content: '',
          loading: false,
        }}
      />,
    );

    expect(screen.getByText('正在联网搜索...')).toBeInTheDocument();
  });

  it('shows the query summarization state', () => {
    render(
      <WebSearchQueryNode
        node={{
          type: 'web-search-query',
          attrs: { status: 'summarizing' },
          content: '',
          loading: false,
        }}
      />,
    );

    expect(screen.getByText('正在总结搜索语句...')).toBeInTheDocument();
  });

  it('reveals the summarized search query when expanded', () => {
    render(
      <WebSearchQueryNode
        node={{
          type: 'web-search-query',
          attrs: {
            status: 'done',
            query: 'AQBot Desktop 0.0.76 Windows 下载地址',
          },
          content: '',
          loading: false,
        }}
      />,
    );

    expect(screen.queryByText('AQBot Desktop 0.0.76 Windows 下载地址')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('搜索语句总结完成'));
    expect(screen.getByText('搜索语句总结完成')).toBeInTheDocument();
    expect(screen.getByText('AQBot Desktop 0.0.76 Windows 下载地址')).toBeInTheDocument();
  });

  it('shows query summary errors below the fold title with an Ant alert', () => {
    const { container } = render(
      <WebSearchQueryNode
        node={{
          type: 'web-search-query',
          attrs: {
            status: 'error',
            query: 'AQBot 产品详情',
          },
          content: '模型返回空搜索语句',
          loading: false,
        }}
      />,
    );

    const title = screen.getByText('搜索语句总结失败');
    expect(title).toBeInTheDocument();
    expect(title.closest('[data-aqbot-search-query-status="error"]')).toBeInTheDocument();
    expect(title.closest('[data-aqbot-search-query-status="error"]')).toHaveStyle({
      color: '#ff4d4f',
    });
    expect(screen.getByText('模型返回空搜索语句')).toBeInTheDocument();
    expect(screen.getByText('AQBot 产品详情')).toBeInTheDocument();
    expect(container.querySelector('.ant-alert-error')).toBeInTheDocument();

    const errorNode = screen.getByText('模型返回空搜索语句');
    expect(title.compareDocumentPosition(errorNode) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows an empty result state instead of rendering nothing', () => {
    render(
      <WebSearchNode
        node={{
          type: 'web-search',
          attrs: { status: 'done' },
          content: '[]',
          loading: false,
        }}
      />,
    );

    expect(screen.getByText('未找到相关搜索结果')).toBeInTheDocument();
  });

  it('shows the concrete search error message', () => {
    const { container } = render(
      <WebSearchNode
        node={{
          type: 'web-search',
          attrs: { status: 'error' },
          content: 'Tavily request failed',
          loading: false,
        }}
      />,
    );

    expect(screen.getByText('Tavily request failed')).toBeInTheDocument();
    expect(container.querySelector('.ant-alert-error')).toBeInTheDocument();
  });
});
