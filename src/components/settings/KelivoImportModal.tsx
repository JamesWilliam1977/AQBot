import { useState } from 'react';
import { Alert, App, Checkbox, Divider, Modal, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { invoke } from '@/lib/invoke';
import { getErrorMessage } from '@/lib/errorMessage';
import type { ThirdPartyImportResult, ThirdPartyImportSummary } from '@/types';
import { ThirdPartyImportUpload } from './ThirdPartyImportUpload';

const { Text, Title } = Typography;

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: (result: ThirdPartyImportResult) => void;
};

function CountItem({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ minWidth: 96 }}>
      <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
      <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

export function KelivoImportModal({ open, onClose, onImported }: Props) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [path, setPath] = useState<string | null>(null);
  const [summary, setSummary] = useState<ThirdPartyImportSummary | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importProviderKeys, setImportProviderKeys] = useState(false);

  const reset = () => {
    setPath(null);
    setSummary(null);
    setImportProviderKeys(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSelectedPath = async (selected: string) => {
    try {
      setPath(selected);
      setSummary(null);
      setScanLoading(true);
      const nextSummary = await invoke<ThirdPartyImportSummary>('scan_kelivo_import', {
        path: selected,
      });
      setSummary(nextSummary);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setScanLoading(false);
    }
  };

  const handleSelectFile = async () => {
    try {
      const { open: openFile } = await import('@tauri-apps/plugin-dialog');
      const selected = await openFile({
        multiple: false,
        filters: [{ name: 'Kelivo', extensions: ['zip'] }],
      });
      if (!selected || typeof selected !== 'string') return;

      await handleSelectedPath(selected);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const handleImport = async () => {
    if (!path || !summary) return;
    setImportLoading(true);
    try {
      const result = await invoke<ThirdPartyImportResult>('import_kelivo_backup', {
        path,
        options: { importProviderKeys },
      });
      message.success(t('settings.kelivoImport.success'));
      onImported(result);
      reset();
      onClose();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('settings.kelivoImport.title')}
      onCancel={handleClose}
      onOk={handleImport}
      okText={t('common.confirm')}
      cancelText={t('common.cancel')}
      okButtonProps={{ disabled: !summary }}
      confirmLoading={importLoading}
      width={640}
    >
      <Space orientation="vertical" size={14} style={{ width: '100%' }}>
        <ThirdPartyImportUpload
          accept=".zip"
          active={open}
          exportPath={t('settings.kelivoImport.exportPath')}
          loading={scanLoading}
          path={path}
          supportedFormats={t('settings.kelivoImport.supportedFormats')}
          uploadHint={t('settings.kelivoImport.uploadHint')}
          onPathSelected={handleSelectedPath}
          onPickFile={handleSelectFile}
        />

        {summary && (
          <>
            <Divider style={{ margin: '2px 0' }} />
            <Title level={5} style={{ margin: 0 }}>{t('settings.kelivoImport.preview')}</Title>
            <Space wrap size={18}>
              <CountItem label={t('settings.kelivoImport.conversations')} value={summary.conversationCount} />
              <CountItem label={t('settings.kelivoImport.messages')} value={summary.messageCount} />
              <CountItem label={t('settings.kelivoImport.files')} value={summary.fileCount} />
              <CountItem label={t('settings.kelivoImport.providers')} value={summary.importableProviderCount} />
              <CountItem label={t('settings.kelivoImport.duplicates')} value={summary.duplicateConversationCount} />
            </Space>
            <Checkbox
              checked={importProviderKeys}
              disabled={summary.importableProviderCount === 0}
              onChange={(event) => setImportProviderKeys(event.target.checked)}
            >
              {t('settings.kelivoImport.importProviderKeys')}
            </Checkbox>
            {summary.skippedEmptyTopicCount > 0 && (
              <Alert
                type="info"
                showIcon
                message={t('settings.kelivoImport.emptyTopics', { count: summary.skippedEmptyTopicCount })}
              />
            )}
            {summary.warnings.length > 0 && (
              <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                {summary.warnings.map((warning, index) => (
                  <Alert
                    key={`${warning.code}-${warning.sourceId ?? index}`}
                    type="warning"
                    showIcon
                    message={warning.message}
                  />
                ))}
              </Space>
            )}
          </>
        )}
      </Space>
    </Modal>
  );
}
