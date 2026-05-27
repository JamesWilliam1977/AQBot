import { describe, expect, it } from 'vitest';

import { parseChatMarkdown, stripAqbotTags } from '../chatMarkdown';

describe('parseChatMarkdown', () => {
  it('parses fenced code blocks into markdown nodes', () => {
    const nodes = parseChatMarkdown('```ts\nconst value = 1;\n```');

    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.some((node) => node.type === 'code_block')).toBe(true);
  });

  it('parses stored assistant d2 replies as a single d2 code block node', () => {
    const nodes = parseChatMarkdown(`\`\`\`d2
User: 用户
UI: 登录页
Auth: 认证服务
DB: 用户库
MFA: 二次验证
Token: Token/Session
App: 业务系统

User -> UI: 输入账号/密码
UI -> Auth: 提交凭证
Auth -> DB: 查询用户 + 校验密码哈希
DB -> Auth: 返回用户记录

Auth -> MFA: 需要二次验证？
MFA -> User: 发送验证码/Push
User -> UI: 输入验证码
UI -> Auth: 提交验证码
Auth -> MFA: 校验验证码

Auth -> Token: 签发 JWT/Session
Token -> Auth: 返回令牌/会话
Auth -> UI: 登录成功(含token)
UI -> App: 携带token访问
\`\`\``);

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      type: 'code_block',
      language: 'd2',
    });
  });

  it('parses inline native think tags as a think node before answer text', () => {
    const nodes = parseChatMarkdown('<think>好的，用户让我讲个笑话。</think>\n\nanswer');

    expect(nodes[0]).toMatchObject({
      type: 'think',
      content: '好的，用户让我讲个笑话。',
    });
    expect(nodes[1]).toMatchObject({
      type: 'paragraph',
    });
  });

  it('does not normalize think-looking text inside fenced code blocks', () => {
    const nodes = parseChatMarkdown('```html\n<think>literal</think>\n```');

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      type: 'code_block',
    });
    expect(String(nodes[0].code)).toContain('<think>literal</think>');
  });

  it('parses html-render tags as custom render nodes', () => {
    const nodes = parseChatMarkdown('<html-render><div class="card">ok</div></html-render>');

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      type: 'html-render',
      content: '<div class="card">ok</div>',
    });
  });

  it('does not parse html-render tags inside fenced code blocks', () => {
    const nodes = parseChatMarkdown('```html\n<html-render><div>literal</div></html-render>\n```');

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      type: 'code_block',
    });
    expect(String(nodes[0].code)).toContain('<html-render><div>literal</div></html-render>');
  });

  it('parses completed html-render comment markers as custom render nodes', () => {
    const nodes = parseChatMarkdown('<!-- html-render-start --><section>legacy</section><!-- html-render-end -->');

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      type: 'html-render',
      content: '<section>legacy</section>',
    });
  });

  it('falls incomplete final html-render tags back to source text', () => {
    const nodes = parseChatMarkdown('<html-render><div>draft');
    const serialized = JSON.stringify(nodes);

    expect(nodes.some((node) => node.type === 'html-render')).toBe(false);
    expect(serialized).toContain('<html-render><div>draft');
  });

  it('strips think and aqbot-only tags when preparing export-safe transcript text', () => {
    const cleaned = stripAqbotTags(`Final answer
<think>Hidden reasoning</think>
<web-search-query data-aqbot="1">query</web-search-query>
<knowledge-retrieval data-aqbot="1">retrieved</knowledge-retrieval>
<web-search data-aqbot="1">[{"title":"A"}]</web-search>
:::mcp tool
payload
:::
Visible tail`);

    expect(cleaned).toBe('Final answer\nVisible tail');
  });

  it('keeps user-visible html-render content in export-safe transcript text', () => {
    const content = '<html-render><div>visible html</div></html-render>';

    expect(stripAqbotTags(content)).toBe(content);
  });
});
