import { App } from 'antd';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatGptImportModal } from '../ChatGptImportModal';

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

describe('ChatGptImportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openMock.mockResolvedValue('/Users/test/chatgpt-export.zip');
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'scan_chatgpt_import') {
        return {
          conversationCount: 3,
          messageCount: 42,
          skippedEmptyConversationCount: 1,
          duplicateConversationCount: 2,
          warnings: [{ code: 'unsupported_content_part', message: 'Image part preserved', sourceId: 'm1' }],
        };
      }
      if (command === 'import_chatgpt_export') {
        return {
          importedConversationCount: 1,
          importedMessageCount: 14,
          skippedDuplicateConversationCount: 2,
          warnings: [],
        };
      }
      return undefined;
    });
  });

  it('scans a selected ChatGPT export and previews counts', async () => {
    const user = userEvent.setup();

    render(
      <App>
        <ChatGptImportModal open onClose={vi.fn()} onImported={vi.fn()} />
      </App>,
    );

    expect(screen.getByText('settings.chatgptImport.supportedFormats')).toBeInTheDocument();
    expect(screen.getByText('settings.chatgptImport.exportPath')).toBeInTheDocument();

    await user.click(screen.getByText('settings.chatgptImport.uploadHint'));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('scan_chatgpt_import', {
        path: '/Users/test/chatgpt-export.zip',
      });
    });
    expect(await screen.findByText('settings.chatgptImport.preview')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Image part preserved')).toBeInTheDocument();
  });

  it('imports the selected ChatGPT export without provider options', async () => {
    const user = userEvent.setup();
    const onImported = vi.fn();

    render(
      <App>
        <ChatGptImportModal open onClose={vi.fn()} onImported={onImported} />
      </App>,
    );

    await user.click(screen.getByText('settings.chatgptImport.uploadHint'));
    await screen.findByText('settings.chatgptImport.preview');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'common.confirm' }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('import_chatgpt_export', {
        path: '/Users/test/chatgpt-export.zip',
      });
      expect(onImported).toHaveBeenCalledTimes(1);
    });
  });
});
