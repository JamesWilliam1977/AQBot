import { beforeEach, describe, expect, it } from 'vitest';

import { handleCommand } from '../browserMock';

type GatewayTemplate = {
  id: string;
  target: string;
  content: string;
};

describe('browserMock gateway templates', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns Claude and Cursor templates that match AQBot runtime contracts', async () => {
    const templates = await handleCommand<GatewayTemplate[]>('list_gateway_templates');

    const cursor = templates.find((template) => template.target === 'cursor');
    expect(cursor).toBeDefined();
    expect(cursor?.content).toContain('"openai.apiKey"');
    expect(cursor?.content).toContain('"openai.apiBaseUrl"');
    expect(cursor?.content).not.toContain('"api_key"');
    expect(cursor?.content).not.toContain('"api_base"');

    const claude = templates.find((template) => template.target === 'claude_code');
    expect(claude).toBeDefined();
    expect(claude?.content).toContain('ANTHROPIC_BASE_URL=');
    expect(claude?.content).toContain('ANTHROPIC_AUTH_TOKEN=');
    expect(claude?.content).not.toContain('ANTHROPIC_API_KEY=');
  });

  it('maps backup manifests into files-page backup rows and cleans up missing entries', async () => {
    await handleCommand('create_backup', { format: 'sqlite' });

    const rows = await handleCommand<any[]>('list_files_page_entries', { category: 'backups' });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toMatch(/^backup_manifest::/);
    expect(rows[0].category).toBe('backups');
    expect(rows[0].path).toContain('/mock/path/');

    await handleCommand('cleanup_missing_files_page_entry', { entryId: rows[0].id });

    const backups = await handleCommand<any[]>('list_backups');
    expect(backups).toHaveLength(0);
  });

  it('stores S3 config and supports S3 backup list/delete commands', async () => {
    await handleCommand('save_s3_config', {
      config: {
        bucket: 'aqbot-backups',
        region: 'us-west-2',
        prefix: 'desktop/',
        endpointUrl: null,
        forcePathStyle: false,
        useDefaultCredentials: false,
        accessKeyId: 'access',
        secretAccessKey: 'secret',
        sessionToken: null,
      },
    });

    const config = await handleCommand<any>('get_s3_config');
    expect(config.bucket).toBe('aqbot-backups');

    const fileName = await handleCommand<string>('s3_backup');
    const backups = await handleCommand<any[]>('s3_list_backups');
    expect(backups[0].fileName).toBe(fileName);

    await handleCommand('s3_delete_backup', { fileName });
    const remaining = await handleCommand<any[]>('s3_list_backups');
    expect(remaining).toHaveLength(0);
  });
});
