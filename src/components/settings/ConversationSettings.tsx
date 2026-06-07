import { Button, Divider, Input, InputNumber, Switch, theme } from 'antd';
import { FolderOpen, RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/stores';
import {
  DEFAULT_AGENT_WORKSPACE_DATETIME_FORMAT,
  DEFAULT_AGENT_WORKSPACE_NAME_STRATEGY,
  DEFAULT_MCP_TOOL_LOOP_MAX_ITERATIONS,
  type AgentWorkspaceNameStrategy,
} from '@/types';
import { SettingsGroup } from './SettingsGroup';
import { SettingsSelect } from './SettingsSelect';

const { TextArea } = Input;

function normalizeTimeoutSeconds(value: number | string | null) {
  const numericValue = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.floor(numericValue));
}

function normalizeMcpToolLoopMaxIterations(value: number | string | null) {
  const numericValue = typeof value === 'number'
    ? value
    : Number(value ?? DEFAULT_MCP_TOOL_LOOP_MAX_ITERATIONS);
  if (!Number.isFinite(numericValue)) return DEFAULT_MCP_TOOL_LOOP_MAX_ITERATIONS;
  return Math.min(100, Math.max(1, Math.floor(numericValue)));
}

function previewAgentWorkspaceName(strategy: AgentWorkspaceNameStrategy, format: string) {
  switch (strategy) {
    case 'created_timestamp':
      return '1700000000';
    case 'created_datetime':
      return sanitizeAgentWorkspacePreview(
        (format || DEFAULT_AGENT_WORKSPACE_DATETIME_FORMAT)
          .replace(/YYYY/g, '2023')
          .replace(/MM/g, '11')
          .replace(/DD/g, '14')
          .replace(/HH/g, '22')
          .replace(/mm/g, '13')
          .replace(/ss/g, '20'),
      );
    case 'conversation_id':
      return 'conv-550e8400';
    case 'uuid':
    default:
      return '550e8400-e29b-41d4-a716-446655440000';
  }
}

function sanitizeAgentWorkspacePreview(value: string) {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-. ]+|[-. ]+$/g, '') || 'workspace';
}

export function ConversationSettings() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const { token } = theme.useToken();
  const rowStyle = { padding: '4px 0' };
  const agentWorkspaceStrategy = settings.agent_workspace_name_strategy ?? DEFAULT_AGENT_WORKSPACE_NAME_STRATEGY;
  const agentWorkspaceDatetimeFormat = settings.agent_workspace_datetime_format ?? DEFAULT_AGENT_WORKSPACE_DATETIME_FORMAT;
  const agentWorkspacePreview = useMemo(
    () => previewAgentWorkspaceName(agentWorkspaceStrategy, agentWorkspaceDatetimeFormat),
    [agentWorkspaceStrategy, agentWorkspaceDatetimeFormat],
  );

  const handleSelectAgentWorkspaceRoot = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('settings.agentWorkspaceRoot'),
      });
      if (selected && typeof selected === 'string') {
        await saveSettings({ agent_workspace_root: selected });
      }
    } catch (e) {
      console.warn('Failed to select agent workspace root:', e);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <SettingsGroup title={t('settings.defaultSystemPrompt')}>
        <div style={{ fontSize: 12, color: token.colorTextDescription, marginBottom: 12 }}>
          {t('settings.defaultSystemPromptDesc')}
        </div>
        <TextArea
          value={settings.default_system_prompt ?? ''}
          onChange={(e) => saveSettings({ default_system_prompt: e.target.value || null })}
          placeholder={t('settings.defaultSystemPromptPlaceholder')}
          autoSize={{ minRows: 3, maxRows: 10 }}
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.groupMessageStyle')}>
        <div className="flex items-center justify-between" style={rowStyle}>
          <span>{t('settings.bubbleStyle')}</span>
          <SettingsSelect
            value={settings.bubble_style}
            onChange={(val) => saveSettings({ bubble_style: val })}
            options={[
              { label: t('settings.bubbleModern'), value: 'modern' },
              { label: t('settings.bubbleCompact'), value: 'compact' },
              { label: t('settings.bubbleMinimal'), value: 'minimal' },
            ]}
          />
        </div>
        <Divider style={{ margin: '4px 0' }} />
        <div className="flex items-center justify-between" style={rowStyle}>
          <div>
            <div>{t('settings.renderUserMarkdown')}</div>
            <div style={{ fontSize: 12, color: token.colorTextDescription }}>{t('settings.renderUserMarkdownDesc')}</div>
          </div>
          <Switch
            checked={settings.render_user_markdown ?? false}
            onChange={(checked) => saveSettings({ render_user_markdown: checked })}
          />
        </div>
      </SettingsGroup>

      <SettingsGroup title={t('settings.multiModelDisplayMode')}>
        <div style={{ fontSize: 12, color: token.colorTextDescription, marginBottom: 12 }}>
          {t('settings.multiModelDisplayModeDesc')}
        </div>
        <div className="flex items-center justify-between" style={rowStyle}>
          <span>{t('settings.multiModelDisplayMode')}</span>
          <SettingsSelect
            value={settings.multi_model_display_mode ?? 'tabs'}
            onChange={(val) => saveSettings({ multi_model_display_mode: val as 'tabs' | 'side-by-side' | 'stacked' })}
            options={[
              { label: t('settings.multiModelDisplayModeTabs'), value: 'tabs' },
              { label: t('settings.multiModelDisplayModeSideBySide'), value: 'side-by-side' },
              { label: t('settings.multiModelDisplayModeStacked'), value: 'stacked' },
            ]}
          />
        </div>
      </SettingsGroup>

      <SettingsGroup title={t('settings.chatSidebar')}>
        <div className="flex items-center justify-between" style={rowStyle}>
          <div>
            <div>{t('settings.chatSidebarCollapsed')}</div>
            <div style={{ fontSize: 12, color: token.colorTextDescription }}>{t('settings.chatSidebarCollapsedDesc')}</div>
          </div>
          <Switch
            checked={settings.chat_sidebar_collapsed ?? false}
            onChange={(checked) => saveSettings({ chat_sidebar_collapsed: checked })}
          />
        </div>
      </SettingsGroup>

      <SettingsGroup title={t('settings.newConversationDefaults')}>
        <div className="flex items-center justify-between" style={rowStyle}>
          <div>
            <div>{t('settings.inheritConversationPreferencesOnCreate')}</div>
            <div style={{ fontSize: 12, color: token.colorTextDescription }}>
              {t('settings.inheritConversationPreferencesOnCreateDesc')}
            </div>
          </div>
          <Switch
            checked={settings.inherit_conversation_preferences_on_create ?? true}
            onChange={(checked) => saveSettings({ inherit_conversation_preferences_on_create: checked })}
          />
        </div>
      </SettingsGroup>

      <SettingsGroup title={t('settings.agentSettings')}>
        <div style={{ fontSize: 12, color: token.colorTextDescription, marginBottom: 12 }}>
          {t('settings.agentWorkspaceRootDesc')}
        </div>
        <div className="flex items-center justify-between gap-3" style={rowStyle}>
          <span>{t('settings.agentWorkspaceRoot')}</span>
          <div className="flex items-center gap-2" style={{ minWidth: 0, flex: 1, justifyContent: 'flex-end' }}>
            <Input
              aria-label={t('settings.agentWorkspaceRoot')}
              value={settings.agent_workspace_root ?? ''}
              onChange={(e) => saveSettings({ agent_workspace_root: e.target.value.trim() || null })}
              placeholder={t('settings.agentWorkspaceRootPlaceholder')}
              style={{ maxWidth: 360 }}
            />
            <Button
              aria-label={t('settings.selectAgentWorkspaceRoot')}
              icon={<FolderOpen size={14} />}
              onClick={handleSelectAgentWorkspaceRoot}
            />
            <Button
              aria-label={t('settings.resetAgentWorkspaceRoot')}
              icon={<RotateCcw size={14} />}
              onClick={() => saveSettings({ agent_workspace_root: null })}
            />
          </div>
        </div>
        <Divider style={{ margin: '4px 0' }} />
        <div className="flex items-center justify-between" style={rowStyle}>
          <span>{t('settings.agentWorkspaceNameStrategy')}</span>
          <SettingsSelect
            value={agentWorkspaceStrategy}
            onChange={(val) => saveSettings({ agent_workspace_name_strategy: val as AgentWorkspaceNameStrategy })}
            options={[
              { label: t('settings.agentWorkspaceNameStrategyUuid'), value: 'uuid' },
              { label: t('settings.agentWorkspaceNameStrategyConversationId'), value: 'conversation_id' },
              { label: t('settings.agentWorkspaceNameStrategyCreatedTimestamp'), value: 'created_timestamp' },
              { label: t('settings.agentWorkspaceNameStrategyCreatedDatetime'), value: 'created_datetime' },
            ]}
          />
        </div>
        <Divider style={{ margin: '4px 0' }} />
        <div className="flex items-center justify-between gap-3" style={rowStyle}>
          <div>
            <div>{t('settings.agentWorkspaceDatetimeFormat')}</div>
            <div style={{ fontSize: 12, color: token.colorTextDescription }}>
              {t('settings.agentWorkspaceDatetimeFormatDesc')}
            </div>
          </div>
          <Input
            aria-label={t('settings.agentWorkspaceDatetimeFormat')}
            value={agentWorkspaceDatetimeFormat}
            onChange={(e) => saveSettings({
              agent_workspace_datetime_format: e.target.value || DEFAULT_AGENT_WORKSPACE_DATETIME_FORMAT,
            })}
            style={{ width: 220 }}
          />
        </div>
        <Divider style={{ margin: '4px 0' }} />
        <div style={{ fontSize: 12, color: token.colorTextDescription, padding: '4px 0' }}>
          {t('settings.agentWorkspacePreview', { value: agentWorkspacePreview })}
        </div>
      </SettingsGroup>

      <SettingsGroup title={t('settings.chatStreamTimeouts')}>
        <div style={{ fontSize: 12, color: token.colorTextDescription, marginBottom: 12 }}>
          {t('settings.chatStreamTimeoutsDesc')}
        </div>
        <div className="flex items-center justify-between" style={rowStyle}>
          <div>
            <div>{t('settings.chatStreamFirstPacketTimeout')}</div>
            <div style={{ fontSize: 12, color: token.colorTextDescription }}>
              {t('settings.chatStreamFirstPacketTimeoutDesc')}
            </div>
          </div>
          <InputNumber
            aria-label={t('settings.chatStreamFirstPacketTimeout')}
            min={0}
            max={3600}
            step={5}
            value={settings.chat_stream_first_packet_timeout_secs ?? 180}
            onChange={(value) => saveSettings({
              chat_stream_first_packet_timeout_secs: normalizeTimeoutSeconds(value),
            })}
            addonAfter="s"
            style={{ width: 120 }}
          />
        </div>
        <Divider style={{ margin: '4px 0' }} />
        <div className="flex items-center justify-between" style={rowStyle}>
          <div>
            <div>{t('settings.chatStreamIdleTimeout')}</div>
            <div style={{ fontSize: 12, color: token.colorTextDescription }}>
              {t('settings.chatStreamIdleTimeoutDesc')}
            </div>
          </div>
          <InputNumber
            aria-label={t('settings.chatStreamIdleTimeout')}
            min={0}
            max={3600}
            step={5}
            value={settings.chat_stream_idle_timeout_secs ?? 90}
            onChange={(value) => saveSettings({
              chat_stream_idle_timeout_secs: normalizeTimeoutSeconds(value),
            })}
            addonAfter="s"
            style={{ width: 120 }}
          />
        </div>
      </SettingsGroup>

      <SettingsGroup title={t('settings.chatMinimap')}>
        <div style={{ fontSize: 12, color: token.colorTextDescription, marginBottom: 12 }}>
          {t('settings.chatMinimapEnabledDesc')}
        </div>
        <div className="flex items-center justify-between" style={rowStyle}>
          <span>{t('settings.chatMinimapEnabled')}</span>
          <Switch
            checked={settings.chat_minimap_enabled ?? false}
            onChange={(checked) => saveSettings({ chat_minimap_enabled: checked })}
          />
        </div>
        {settings.chat_minimap_enabled && (
          <>
            <Divider style={{ margin: '4px 0' }} />
            <div className="flex items-center justify-between" style={rowStyle}>
              <span>{t('settings.chatMinimapStyle')}</span>
              <SettingsSelect
                value={settings.chat_minimap_style ?? 'faq'}
                onChange={(val) => saveSettings({ chat_minimap_style: val as 'faq' | 'sticky' })}
                options={[
                  { label: t('settings.chatMinimapFaq'), value: 'faq' },
                  { label: t('settings.chatMinimapSticky'), value: 'sticky' },
                ]}
              />
            </div>
          </>
        )}
      </SettingsGroup>

      <SettingsGroup title={t('settings.additionalFeatures')}>
        <div className="flex items-center justify-between" style={rowStyle}>
          <div className="flex flex-col gap-1">
            <span>{t('settings.documentAttachmentReading')}</span>
            <span className="text-xs opacity-60">{t('settings.documentAttachmentReadingDesc')}</span>
          </div>
          <Switch
            checked={settings.document_attachment_reading_enabled ?? false}
            onChange={(checked) => saveSettings({ document_attachment_reading_enabled: checked })}
          />
        </div>
        <Divider style={{ margin: '4px 0' }} />
        <div className="flex items-center justify-between" style={rowStyle}>
          <span>{t('settings.showImageModelsInModelSelector')}</span>
          <Switch
            checked={settings.show_image_models_in_model_selector ?? false}
            onChange={(checked) => saveSettings({ show_image_models_in_model_selector: checked })}
          />
        </div>
        <Divider style={{ margin: '4px 0' }} />
        <div className="flex items-center justify-between" style={rowStyle}>
          <div>
            <div>{t('settings.mcpToolLoopMaxIterations')}</div>
            <div style={{ fontSize: 12, color: token.colorTextDescription }}>
              {t('settings.mcpToolLoopMaxIterationsDesc')}
            </div>
          </div>
          <InputNumber
            aria-label={t('settings.mcpToolLoopMaxIterations')}
            min={1}
            max={100}
            step={1}
            value={settings.mcp_tool_loop_max_iterations ?? DEFAULT_MCP_TOOL_LOOP_MAX_ITERATIONS}
            onChange={(value) => saveSettings({
              mcp_tool_loop_max_iterations: normalizeMcpToolLoopMaxIterations(value),
            })}
            style={{ width: 120 }}
          />
        </div>
      </SettingsGroup>
    </div>
  );
}
