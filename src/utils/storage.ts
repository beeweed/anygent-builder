import { Chat, AppSettings, ProviderId, ThemeMode, SystemPromptMode } from '../types';

const CHATS_KEY = 'anygent_chats';
const SETTINGS_KEY = 'anygent_settings';
const THEME_KEY = 'anygent_theme';

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  selectedModel: '',
  selectedProvider: 'fireworks',
  providerKeys: { fireworks: '' },
  fireworksCustomModel: '',
  e2bApiKey: '',
  e2bTemplate: '',
  theme: 'dark',
  systemPromptMode: 'big',
};

export function loadChats(): Chat[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    if (!raw) return [];
    const chats = JSON.parse(raw) as Chat[];
    // Migrate old chats that may have `provider: 'openrouter'` from a previous
    // version of the app — force everything to `fireworks`.
    return chats.map((c) => ({
      ...c,
      provider: 'fireworks' as ProviderId,
    }));
  } catch {
    return [];
  }
}

export function saveChats(chats: Chat[]): void {
  localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings> & {
      providerKeys?: Record<string, string>;
    };

    // Migration: if the user previously used OpenRouter, ignore that key.
    const fireworksKey =
      parsed.providerKeys?.fireworks ||
      (parsed.selectedProvider === 'fireworks' ? parsed.apiKey : '') ||
      '';

    const providerKeys: Record<ProviderId, string> = {
      fireworks: fireworksKey,
    };

    const systemPromptMode: SystemPromptMode =
      parsed.systemPromptMode === 'small' ? 'small' : 'big';

    return {
      apiKey: providerKeys.fireworks,
      selectedModel: parsed.selectedModel || '',
      selectedProvider: 'fireworks',
      providerKeys,
      fireworksCustomModel: parsed.fireworksCustomModel || '',
      e2bApiKey: parsed.e2bApiKey || '',
      e2bTemplate: parsed.e2bTemplate || '',
      theme: parsed.theme || loadTheme(),
      systemPromptMode,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  saveTheme(settings.theme);
}

export function loadTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'light') return 'light';
    return 'dark';
  } catch {
    return 'dark';
  }
}

export function saveTheme(theme: ThemeMode): void {
  localStorage.setItem(THEME_KEY, theme);
  // Apply theme to document
  if (theme === 'light') {
    document.documentElement.classList.add('light');
    document.documentElement.classList.remove('dark');
  } else {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  }
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}