import { App } from 'antd';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KelivoImportModal } from '../KelivoImportModal';

const { invokeMock, openMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openMock: vi.fn(),
}));

vi.mock('@/lib/invoke', () => ({
  invoke: invokeMock,
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === 'string' ? fallback : key,
  }),
}));

describe('KelivoImportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openMock.mockResolvedValue('/Users/test/kelivo.zip');
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'scan_kelivo_import') {
        return {
          conversationCount: 2,
          messageCount: 12,
          fileCount: 1,
          importableProviderCount: 1,
          skippedEmptyTopicCount: 1,
          duplicateConversationCount: 0,
          warnings: [{ code: 'missing_attachment', message: 'Attachment missing', sourceId: 'm1' }],
        };
      }
      if (command === 'import_kelivo_backup') {
        return {
          importedConversationCount: 2,
          importedMessageCount: 12,
          importedFileCount: 1,
          importedProviderCount: 0,
          skippedDuplicateConversationCount: 0,
          warnings: [],
        };
      }
      return undefined;
    });
  });

  it('scans a selected Kelivo backup and previews counts', async () => {
    const user = userEvent.setup();

    render(
      <App>
        <KelivoImportModal open onClose={vi.fn()} onImported={vi.fn()} />
      </App>,
    );

    expect(screen.getByText('settings.kelivoImport.supportedFormats')).toBeInTheDocument();
    expect(screen.getByText('settings.kelivoImport.exportPath')).toBeInTheDocument();

    await user.click(screen.getByText('settings.kelivoImport.uploadHint'));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('scan_kelivo_import', {
        path: '/Users/test/kelivo.zip',
      });
    });
    expect(await screen.findByText('settings.kelivoImport.preview')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Attachment missing')).toBeInTheDocument();
  });

  it('imports without provider keys by default and can opt in', async () => {
    const user = userEvent.setup();
    const onImported = vi.fn();

    render(
      <App>
        <KelivoImportModal open onClose={vi.fn()} onImported={onImported} />
      </App>,
    );

    await user.click(screen.getByText('settings.kelivoImport.uploadHint'));
    await screen.findByText('settings.kelivoImport.preview');
    await user.click(screen.getByLabelText('settings.kelivoImport.importProviderKeys'));
    await user.click(screen.getByRole('button', { name: 'common.confirm' }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('import_kelivo_backup', {
        path: '/Users/test/kelivo.zip',
        options: { importProviderKeys: true },
      });
      expect(onImported).toHaveBeenCalledTimes(1);
    });
  });
});
