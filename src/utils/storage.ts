import { Chat, AppSettings, ProviderId } from '../types';

const CHATS_KEY = 'anygent_chats';
const SETTINGS_KEY = 'anygent_settings';

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  selectedModel: '',
  selectedProvider: 'openrouter',
  providerKeys: { openrouter: '', fireworks: '' },
  fireworksCustomModel: '',
  e2bApiKey: '',
};

export function loadChats(): Chat[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    if (!raw) return [];
    const chats = JSON.parse(raw) as Chat[];
    // Migrate old chats that don't have a provider field
    return chats.map((c) => ({
      ...c,
      provider: c.provider || 'openrouter',
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
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    // Migrate old settings
    const providerKeys: Record<ProviderId, string> = {
      openrouter: parsed.providerKeys?.openrouter || parsed.apiKey || '',
      fireworks: parsed.providerKeys?.fireworks || '',
    };
    return {
      apiKey: providerKeys[parsed.selectedProvider || 'openrouter'] || parsed.apiKey || '',
      selectedModel: parsed.selectedModel || '',
      selectedProvider: parsed.selectedProvider || 'openrouter',
      providerKeys,
      fireworksCustomModel: parsed.fireworksCustomModel || '',
      e2bApiKey: parsed.e2bApiKey || '',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}