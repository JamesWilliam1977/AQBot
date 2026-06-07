import type React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '@/types';
import { ConversationSettings } from '../ConversationSettings';

const mocks = vi.hoisted(() => ({
  saveSettings: vi.fn(),
}));

let settings: Partial<AppSettings> = {};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const labels: Record<string, string> = {
        'settings.additionalFeatures': '附加功能',
        'settings.chatMinimap': '对话导航',
        'settings.newConversationDefaults': '新建对话',
        'settings.inheritConversationPreferencesOnCreate': '继承当前对话能力配置',
        'settings.inheritConversationPreferencesOnCreateDesc': '开启后，新建对话会沿用当前对话的联网、知识库、记忆、工具和思考设置。',
        'settings.chatStreamTimeouts': '流式响应超时',
        'settings.chatStreamTimeoutsDesc': '设置模型流式响应的首包和空闲等待时间，填 0 表示不限制。',
        'settings.chatStreamFirstPacketTimeout': '首包超时',
        'settings.chatStreamIdleTimeout': '空闲超时',
        'settings.mcpToolLoopMaxIterations': 'MCP 工具调用最大轮次',
        'settings.mcpToolLoopMaxIterationsDesc': '限制单次回复中模型连续调用 MCP 工具的最大轮次，数值过高会增加耗时、Token 与工具执行成本。',
        'settings.chatSidebar': '左侧对话栏',
        'settings.chatSidebarCollapsed': '左侧对话栏默认折叠',
        'settings.chatSidebarCollapsedDesc': '开启后，对话页左侧对话栏会默认收起，聊天区域获得更多横向空间。',
        'settings.documentAttachmentReading': '读取文档附件',
        'settings.documentAttachmentReadingDesc': '开启后，PDF、DOC、DOCX 附件会解析为文本并发送给模型，不会加入知识库。',
        'settings.showImageModelsInModelSelector': '模型选择器中显示绘画模型',
        'settings.agentSettings': 'Agent',
        'settings.agentWorkspaceRoot': '默认工作目录',
        'settings.agentWorkspaceRootDesc': '新 Agent 对话会在该目录下自动创建独立工作目录。留空时使用 ~/.aqbot/workspace。',
        'settings.agentWorkspaceRootPlaceholder': '留空使用默认目录',
        'settings.agentWorkspaceNameStrategy': '目录命名格式',
        'settings.agentWorkspaceNameStrategyUuid': 'UUID',
        'settings.agentWorkspaceNameStrategyConversationId': '对话 ID',
        'settings.agentWorkspaceNameStrategyCreatedTimestamp': '创建时间戳',
        'settings.agentWorkspaceNameStrategyCreatedDatetime': '格式化创建时间',
        'settings.agentWorkspaceDatetimeFormat': '时间命名格式',
        'settings.agentWorkspaceDatetimeFormatDesc': '支持 YYYY、MM、DD、HH、mm、ss；非法文件名字符会自动替换为 -。',
        'settings.agentWorkspacePreview': '预览：2023-11-14-22-13-20',
        'settings.resetAgentWorkspaceRoot': '重置默认目录',
      };
      return labels[key] ?? fallback ?? key;
    },
  }),
}));

vi.mock('antd', () => {
  const Input = ({
    value,
    onChange,
    placeholder,
    'aria-label': ariaLabel,
  }: {
    value?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    placeholder?: string;
    'aria-label'?: string;
  }) => (
    <input
      aria-label={ariaLabel ?? placeholder}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={onChange}
    />
  );
  Input.TextArea = ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
    placeholder?: string;
  }) => (
    <textarea
      placeholder={placeholder}
      value={value}
      onChange={onChange}
    />
  );

  return {
    Divider: () => <hr />,
    Input,
    Switch: ({
      checked,
      onChange,
    }: {
      checked?: boolean;
      onChange?: (checked: boolean) => void;
    }) => (
      <button
        aria-checked={checked}
        role="switch"
        type="button"
        onClick={() => onChange?.(!checked)}
      />
    ),
    InputNumber: ({
      value,
      onChange,
      'aria-label': ariaLabel,
    }: {
      value?: number;
      onChange?: (value: number | null) => void;
      'aria-label'?: string;
    }) => (
      <input
        aria-label={ariaLabel}
        type="number"
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value === '' ? null : Number(event.target.value))}
      />
    ),
    Card: ({ children }: { children?: React.ReactNode }) => <section>{children}</section>,
    Button: ({
      children,
      onClick,
      'aria-label': ariaLabel,
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
      'aria-label'?: string;
    }) => (
      <button aria-label={ariaLabel} type="button" onClick={onClick}>
        {children}
      </button>
    ),
    Dropdown: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    theme: {
      useToken: () => ({
        token: {
          colorBgBase: '#ffffff',
          colorBgContainer: '#ffffff',
          colorBorderSecondary: '#eeeeee',
          colorFillSecondary: '#f5f5f5',
          colorFillTertiary: '#fafafa',
          colorText: '#111111',
          colorTextDescription: '#666666',
          colorTextSecondary: '#444444',
        },
      }),
    },
  };
});

vi.mock('../SettingsSelect', () => ({
  SettingsSelect: ({
    value,
    onChange,
    options,
  }: {
    value?: string;
    onChange?: (value: string) => void;
    options: Array<{ label: React.ReactNode; value: string }>;
  }) => (
    <select
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('@/stores', () => ({
  useSettingsStore: (selector: (state: {
    settings: Partial<AppSettings>;
    saveSettings: typeof mocks.saveSettings;
  }) => unknown) => selector({
    settings,
    saveSettings: mocks.saveSettings,
  }),
}));

describe('ConversationSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settings = {
      bubble_style: 'minimal',
      chat_minimap_enabled: false,
      chat_minimap_style: 'faq',
      default_system_prompt: null,
      multi_model_display_mode: 'tabs',
      render_user_markdown: false,
      inherit_conversation_preferences_on_create: true,
      document_attachment_reading_enabled: false,
      show_image_models_in_model_selector: false,
      chat_stream_first_packet_timeout_secs: 180,
      chat_stream_idle_timeout_secs: 90,
      mcp_tool_loop_max_iterations: 100,
      chat_sidebar_collapsed: false,
      agent_workspace_root: null,
      agent_workspace_name_strategy: 'uuid',
      agent_workspace_datetime_format: 'YYYY-MM-DD-HH-mm-ss',
    };
  });

  it('renders the additional features group below chat navigation', () => {
    render(<ConversationSettings />);

    const text = document.body.textContent ?? '';
    expect(text.indexOf('对话导航')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('附加功能')).toBeGreaterThan(text.indexOf('对话导航'));
    const additionalGroup = screen.getByText('附加功能').parentElement?.parentElement;
    const timeoutGroup = screen.getByText('流式响应超时').parentElement?.parentElement;
    expect(additionalGroup).not.toBeNull();
    expect(timeoutGroup).not.toBeNull();
    expect(screen.getByText('模型选择器中显示绘画模型')).toBeInTheDocument();
    expect(screen.getByText('读取文档附件')).toBeInTheDocument();
    expect(screen.getByText('开启后，PDF、DOC、DOCX 附件会解析为文本并发送给模型，不会加入知识库。')).toBeInTheDocument();
    expect(within(additionalGroup as HTMLElement).getByText('MCP 工具调用最大轮次')).toBeInTheDocument();
    expect(within(timeoutGroup as HTMLElement).queryByText('MCP 工具调用最大轮次')).not.toBeInTheDocument();
  });

  it('saves the document attachment reading setting when toggled', () => {
    render(<ConversationSettings />);

    const additionalGroup = screen.getByText('附加功能').parentElement?.parentElement;
    expect(additionalGroup).not.toBeNull();
    const toggles = within(additionalGroup as HTMLElement).getAllByRole('switch');

    fireEvent.click(toggles[0]);

    expect(mocks.saveSettings).toHaveBeenCalledWith({
      document_attachment_reading_enabled: true,
    });
  });

  it('saves the image-model selector setting when toggled', () => {
    render(<ConversationSettings />);

    const additionalGroup = screen.getByText('附加功能').parentElement?.parentElement;
    expect(additionalGroup).not.toBeNull();
    const toggles = within(additionalGroup as HTMLElement).getAllByRole('switch');

    fireEvent.click(toggles[1]);

    expect(mocks.saveSettings).toHaveBeenCalledWith({
      show_image_models_in_model_selector: true,
    });
  });

  it('saves the disabled image-model selector setting when toggled off', () => {
    settings = {
      ...settings,
      show_image_models_in_model_selector: true,
    };

    render(<ConversationSettings />);

    const additionalGroup = screen.getByText('附加功能').parentElement?.parentElement;
    expect(additionalGroup).not.toBeNull();
    const toggles = within(additionalGroup as HTMLElement).getAllByRole('switch');

    fireEvent.click(toggles[1]);

    expect(mocks.saveSettings).toHaveBeenCalledWith({
      show_image_models_in_model_selector: false,
    });
  });

  it('saves stream timeout settings from conversation settings', () => {
    render(<ConversationSettings />);

    expect(screen.getByText('流式响应超时')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('首包超时'), { target: { value: '45' } });
    expect(mocks.saveSettings).toHaveBeenCalledWith({
      chat_stream_first_packet_timeout_secs: 45,
    });

    fireEvent.change(screen.getByLabelText('空闲超时'), { target: { value: '0' } });
    expect(mocks.saveSettings).toHaveBeenCalledWith({
      chat_stream_idle_timeout_secs: 0,
    });
  });

  it('saves MCP tool loop iteration settings from conversation settings', () => {
    render(<ConversationSettings />);

    expect(screen.getByText('MCP 工具调用最大轮次')).toBeInTheDocument();
    expect(screen.getByText('限制单次回复中模型连续调用 MCP 工具的最大轮次，数值过高会增加耗时、Token 与工具执行成本。')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('MCP 工具调用最大轮次'), { target: { value: '25' } });
    expect(mocks.saveSettings).toHaveBeenCalledWith({
      mcp_tool_loop_max_iterations: 25,
    });

    fireEvent.change(screen.getByLabelText('MCP 工具调用最大轮次'), { target: { value: '' } });
    expect(mocks.saveSettings).toHaveBeenCalledWith({
      mcp_tool_loop_max_iterations: 100,
    });

    fireEvent.change(screen.getByLabelText('MCP 工具调用最大轮次'), { target: { value: '1000' } });
    expect(mocks.saveSettings).toHaveBeenCalledWith({
      mcp_tool_loop_max_iterations: 100,
    });
  });

  it('saves the chat sidebar collapsed setting when toggled', () => {
    render(<ConversationSettings />);

    const sidebarGroup = screen.getByText('左侧对话栏').parentElement?.parentElement;
    expect(sidebarGroup).not.toBeNull();
    const toggle = within(sidebarGroup as HTMLElement).getByRole('switch');

    fireEvent.click(toggle);

    expect(mocks.saveSettings).toHaveBeenCalledWith({
      chat_sidebar_collapsed: true,
    });
  });

  it('saves the new-conversation inheritance setting when toggled', () => {
    render(<ConversationSettings />);

    const inheritanceGroup = screen.getByText('新建对话').parentElement?.parentElement;
    expect(inheritanceGroup).not.toBeNull();
    const toggle = within(inheritanceGroup as HTMLElement).getByRole('switch');

    expect(screen.getByText('继承当前对话能力配置')).toBeInTheDocument();
    expect(screen.getByText('开启后，新建对话会沿用当前对话的联网、知识库、记忆、工具和思考设置。')).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(mocks.saveSettings).toHaveBeenCalledWith({
      inherit_conversation_preferences_on_create: false,
    });
  });

  it('saves agent workspace defaults from conversation settings', () => {
    render(<ConversationSettings />);

    const agentGroup = screen.getByText('Agent').parentElement?.parentElement;
    expect(agentGroup).not.toBeNull();
    expect(within(agentGroup as HTMLElement).getByText('默认工作目录')).toBeInTheDocument();
    expect(within(agentGroup as HTMLElement).getByText('目录命名格式')).toBeInTheDocument();
    expect(within(agentGroup as HTMLElement).getByText('预览：2023-11-14-22-13-20')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('默认工作目录'), { target: { value: '/tmp/aqbot-agents' } });
    expect(mocks.saveSettings).toHaveBeenCalledWith({
      agent_workspace_root: '/tmp/aqbot-agents',
    });

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[selects.length - 1], { target: { value: 'created_timestamp' } });
    expect(mocks.saveSettings).toHaveBeenCalledWith({
      agent_workspace_name_strategy: 'created_timestamp',
    });

    fireEvent.change(screen.getByLabelText('时间命名格式'), { target: { value: 'YYYY-MM-DD-HH:mm:ss' } });
    expect(mocks.saveSettings).toHaveBeenCalledWith({
      agent_workspace_datetime_format: 'YYYY-MM-DD-HH:mm:ss',
    });

    fireEvent.click(screen.getByRole('button', { name: '重置默认目录' }));
    expect(mocks.saveSettings).toHaveBeenCalledWith({
      agent_workspace_root: null,
    });
  });
});
