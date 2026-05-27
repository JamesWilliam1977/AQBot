import { describe, expect, it } from 'vitest';

import {
  normalizeHtmlRenderMarkers,
  shouldFallbackIncompleteHtmlRender,
} from '../chatHtmlRender';

describe('chat html render marker compatibility', () => {
  it('converts completed comment markers to html-render tags', () => {
    expect(normalizeHtmlRenderMarkers('before\n<!-- html-render-start --><div>ok</div><!-- html-render-end -->\nafter')).toBe(
      'before\n<html-render><div>ok</div></html-render>\nafter',
    );
  });

  it('converts multiple completed marker pairs independently', () => {
    expect(normalizeHtmlRenderMarkers('<!-- html-render-start --><b>a</b><!-- html-render-end -->\n<!-- html-render-start --><i>b</i><!-- html-render-end -->')).toBe(
      '<html-render><b>a</b></html-render>\n<html-render><i>b</i></html-render>',
    );
  });

  it('keeps incomplete comment markers renderable while streaming', () => {
    expect(normalizeHtmlRenderMarkers('before <!-- html-render-start --><div>draft', { final: false })).toBe(
      'before <html-render><div>draft',
    );
  });

  it('falls incomplete comment markers back to source text after streaming ends', () => {
    const source = 'before <!-- html-render-start --><div>draft';

    expect(normalizeHtmlRenderMarkers(source, { final: true })).toBe(source);
  });

  it('detects incomplete html-render tags only after final output', () => {
    expect(shouldFallbackIncompleteHtmlRender('<html-render><div>draft', { final: false })).toBe(false);
    expect(shouldFallbackIncompleteHtmlRender('<html-render><div>draft', { final: true })).toBe(true);
    expect(shouldFallbackIncompleteHtmlRender('<html-render><div>ok</div></html-render>', { final: true })).toBe(false);
  });
});
