import { Alert, Checkbox, Modal, Space, Table, Typography, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  CodexSessionVisibilityStatus,
  CodexSessionVisibilityStatusRow,
} from '@/types';

const { Text } = Typography;

type StatusRow = CodexSessionVisibilityStatusRow & {
  key: string;
};

interface CodexSessionVisibilityModalProps {
  open: boolean;
  loading: boolean;
  repairing: boolean;
  status: CodexSessionVisibilityStatus | null;
  createBackup: boolean;
  onCreateBackupChange: (checked: boolean) => void;
  onCancel: () => void;
  onRepair: () => void;
}

export function CodexSessionVisibilityModal({
  open,
  loading,
  repairing,
  status,
  createBackup,
  onCreateBackupChange,
  onCancel,
  onRepair,
}: CodexSessionVisibilityModalProps) {
  const { t } = useTranslation();
  const { token } = theme.useToken();

  const rows = useMemo<StatusRow[]>(
    () => status?.statusRows.map((row, index) => ({
      ...row,
      key: `${row.scope}-${row.provider ?? 'workspace'}-${index}`,
    })) ?? [],
    [status],
  );

  const columns = useMemo<ColumnsType<StatusRow>>(
    () => [
      {
        title: t('gateway.codexRepairVisibilityTableScope'),
        dataIndex: 'scope',
        key: 'scope',
      },
      {
        title: t('gateway.codexRepairVisibilityTableProvider'),
        dataIndex: 'provider',
        key: 'provider',
        render: (value: string | null) => value || '-',
      },
      {
        title: t('gateway.codexRepairVisibilityTableCount'),
        dataIndex: 'count',
        key: 'count',
        width: 96,
      },
      {
        title: t('gateway.codexRepairVisibilityTableMismatch'),
        dataIndex: 'mismatchedCount',
        key: 'mismatchedCount',
        width: 112,
      },
      {
        title: t('gateway.codexRepairVisibilityTableStatus'),
        dataIndex: 'status',
        key: 'status',
        width: 132,
        render: (_: string, row) => (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            borderRadius: 4,
            padding: '2px 8px',
            border: `1px solid ${row.mismatchedCount > 0 ? token.colorWarningBorder : token.colorSuccessBorder}`,
            background: row.mismatchedCount > 0 ? token.colorWarningBg : token.colorSuccessBg,
            color: row.mismatchedCount > 0 ? token.colorWarningText : token.colorSuccessText,
          }}>
            {row.mismatchedCount > 0
              ? t('gateway.codexRepairVisibilityStatusNeedsRepair')
              : t('gateway.codexRepairVisibilityStatusOk')}
          </span>
        ),
      },
    ],
    [t, token],
  );

  return (
    <Modal
      title={t('gateway.codexRepairVisibilityModalTitle')}
      aria-label={t('gateway.codexRepairVisibilityModalTitle')}
      open={open}
      width={760}
      onCancel={onCancel}
      onOk={onRepair}
      okText={t('gateway.codexRepairVisibilityConfirmOk')}
      cancelText={t('gateway.codexRepairVisibilityConfirmCancel')}
      confirmLoading={repairing}
      okButtonProps={{ disabled: loading || !status }}
    >
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <div style={{
          border: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorFillTertiary,
          borderRadius: 6,
          padding: 12,
        }}>
          <Text strong>{t('gateway.codexRepairVisibilityCurrentStatus')}</Text>
          <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
            <Text type="secondary">
              {t('gateway.codexRepairVisibilityTargetProvider', {
                provider: status?.targetProvider ?? '-',
              })}
            </Text>
            <Text type="secondary">{status?.codexHome ?? '-'}</Text>
            <Text>
              {t('gateway.codexRepairVisibilityMismatchSummary', {
                sessions: status?.mismatchedSessionFiles ?? 0,
                total: status?.totalSessionFiles ?? 0,
                sqlite: status?.sqliteMismatchedRows ?? 0,
                workspace: status?.workspaceRootsNeedingUpdate ?? 0,
              })}
            </Text>
          </div>
        </div>

        <Table<StatusRow>
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={false}
          locale={{ emptyText: t('gateway.codexRepairVisibilityNoStatusRows') }}
        />

        <Alert
          type="warning"
          showIcon
          title={t('gateway.codexRepairVisibilityRiskTitle')}
          description={t('gateway.codexRepairVisibilityRiskContent')}
        />

        {status?.encryptedContentWarning && (
          <Alert type="warning" showIcon description={status.encryptedContentWarning} />
        )}

        <Checkbox
          checked={createBackup}
          onChange={(event) => onCreateBackupChange(event.target.checked)}
        >
          {t('gateway.codexRepairVisibilityCreateBackup')}
        </Checkbox>
      </Space>
    </Modal>
  );
}
