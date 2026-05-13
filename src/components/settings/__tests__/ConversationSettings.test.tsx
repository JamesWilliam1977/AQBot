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
        'settings.chatStreamTimeouts': '流式响应超时',
        'settings.chatStreamTimeoutsDesc': '设置模型流式响应的首包和空闲等待时间，填 0 表示不限制。',
        'settings.chatStreamFirstPacketTimeout': '首包超时',
        'settings.chatStreamIdleTimeout': '空闲超时',
        'settings.chatSidebar': '左侧对话栏',
        'settings.chatSidebarCollapsed': '左侧对话栏默认折叠',
        'settings.chatSidebarCollapsedDesc': '开启后，对话页左侧对话栏会默认收起，聊天区域获得更多横向空间。',
        'settings.documentAttachmentReading': '读取文档附件',
        'settings.documentAttachmentReadingDesc': '开启后，PDF、DOC、DOCX 附件会解析为文本并发送给模型，不会加入知识库。',
        'settings.showImageModelsInModelSelector': '模型选择器中显示绘画模型',
      };
      return labels[key] ?? fallback ?? key;
    },
  }),
}));

vi.mock('antd', () => {
  const Input = () => null;
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
      document_attachment_reading_enabled: false,
      show_image_models_in_model_selector: false,
      chat_stream_first_packet_timeout_secs: 180,
      chat_stream_idle_timeout_secs: 90,
      chat_sidebar_collapsed: false,
    };
  });

  it('renders the additional features group below chat navigation', () => {
    render(<ConversationSettings />);

    const text = document.body.textContent ?? '';
    expect(text.indexOf('对话导航')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('附加功能')).toBeGreaterThan(text.indexOf('对话导航'));
    expect(screen.getByText('模型选择器中显示绘画模型')).toBeInTheDocument();
    expect(screen.getByText('读取文档附件')).toBeInTheDocument();
    expect(screen.getByText('开启后，PDF、DOC、DOCX 附件会解析为文本并发送给模型，不会加入知识库。')).toBeInTheDocument();
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
});
