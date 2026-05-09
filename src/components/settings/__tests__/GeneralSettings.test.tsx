import type React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '@/types';
import { GeneralSettings } from '../GeneralSettings';

const mocks = vi.hoisted(() => ({
  saveSettings: vi.fn(),
  invoke: vi.fn(),
}));

let settings: Partial<AppSettings> = {};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: {
      language: 'zh-CN',
      changeLanguage: vi.fn(),
    },
    t: (key: string) => {
      const labels: Record<string, string> = {
        'settings.groupLanguage': '语言',
        'settings.language': '语言',
        'settings.groupStartup': '启动',
        'settings.autoStart': '开机自启动',
        'settings.showOnStart': '启动时显示窗口',
        'settings.groupTray': '托盘',
        'settings.minimizeToTray': '关闭时最小化到托盘',
        'settings.releaseWebviewOnTray': '释放界面进程',
        'desktop.alwaysOnTop': '窗口置顶',
        'desktop.startMinimized': '启动时最小化',
      };
      return labels[key] ?? key;
    },
  }),
}));

vi.mock('antd', () => {
  const Input = () => null;
  Input.TextArea = () => null;

  return {
    Card: ({ children }: { children?: React.ReactNode }) => <section>{children}</section>,
    Divider: () => <hr />,
    Dropdown: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Input,
    Switch: ({
      checked,
      disabled,
      onChange,
    }: {
      checked?: boolean;
      disabled?: boolean;
      onChange?: (checked: boolean) => void;
    }) => (
      <button
        aria-checked={checked}
        disabled={disabled}
        role="switch"
        type="button"
        onClick={() => onChange?.(!checked)}
      />
    ),
    theme: {
      useToken: () => ({
        token: {
          colorBgBase: '#ffffff',
          colorBgContainer: '#ffffff',
          colorBorderSecondary: '#eeeeee',
          colorFillSecondary: '#f5f5f5',
          colorFillTertiary: '#fafafa',
          colorText: '#111111',
          colorTextSecondary: '#444444',
        },
      }),
    },
  };
});

vi.mock('@/lib/constants', () => ({
  LANG_OPTIONS: [{ key: 'zh-CN', label: '简体中文', icon: '中' }],
}));

vi.mock('@/lib/invoke', () => ({
  isTauri: () => true,
  invoke: mocks.invoke,
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

function releaseWebviewSwitch() {
  const row = screen.getByText('释放界面进程').parentElement;
  expect(row).not.toBeNull();
  return within(row as HTMLElement).getByRole('switch');
}

describe('GeneralSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue(undefined);
    settings = {
      auto_start: false,
      show_on_start: true,
      minimize_to_tray: true,
      always_on_top: false,
      start_minimized: false,
      release_webview_on_tray: false,
    };
  });

  it('renders the release-webview setting disabled by default state false', () => {
    render(<GeneralSettings />);

    const toggle = releaseWebviewSwitch();

    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('saves release-webview setting and syncs native state when toggled', () => {
    render(<GeneralSettings />);

    fireEvent.click(releaseWebviewSwitch());

    expect(mocks.saveSettings).toHaveBeenCalledWith({
      release_webview_on_tray: true,
    });
    expect(mocks.invoke).toHaveBeenCalledWith('set_release_webview_on_tray', {
      enabled: true,
    });
  });

  it('disables release-webview setting when close-to-tray is disabled', () => {
    settings = {
      ...settings,
      minimize_to_tray: false,
      release_webview_on_tray: true,
    };

    render(<GeneralSettings />);

    const toggle = releaseWebviewSwitch();
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });
});
