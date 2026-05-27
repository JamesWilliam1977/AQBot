import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HtmlRenderNode } from '../HtmlRenderNode';

describe('HtmlRenderNode', () => {
  it('renders sanitized html preview by default', () => {
    render(
      <HtmlRenderNode
        node={{
          type: 'html-render',
          raw: '<html-render><div style="color:red" onclick="bad()">safe</div><script>alert(1)</script></html-render>',
          content: '<div style="color:red" onclick="bad()">safe</div><script>alert(1)</script>',
        }}
      />,
    );

    const preview = screen.getByTestId('html-render-preview');
    expect(preview.innerHTML).toContain('style="color:red"');
    expect(preview.innerHTML).toContain('safe');
    expect(preview.innerHTML).not.toContain('onclick');
    expect(preview.innerHTML).not.toContain('<script');
  });

  it('removes unsafe urls from rendered links', () => {
    render(
      <HtmlRenderNode
        node={{
          type: 'html-render',
          raw: '<html-render><a href="javascript:alert(1)">bad</a></html-render>',
          content: '<a href="javascript:alert(1)">bad</a>',
        }}
      />,
    );

    const link = screen.getByText('bad');
    expect(link).not.toHaveAttribute('href');
  });

  it('can switch from preview to source without losing original content', () => {
    render(
      <HtmlRenderNode
        node={{
          type: 'html-render',
          raw: '<html-render><section><h1>Title</h1></section></html-render>',
          content: '<section><h1>Title</h1></section>',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '源码' }));

    expect(screen.getByTestId('html-render-source')).toHaveTextContent('<section><h1>Title</h1></section>');
  });
});
