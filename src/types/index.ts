export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  provider: ProviderId;
  createdAt: number;
  updatedAt: number;
}

export interface Model {
  id: string;
  name: string;
  context_length?: number;
  pricing?: {
    prompt: string;
    completion: string;
  };
}

export type ProviderId = 'openrouter' | 'fireworks';

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  description: string;
  baseUrl: string;
  placeholder: string;
}

export interface AppSettings {
  apiKey: string; // legacy, kept for backward compat (openrouter key)
  selectedModel: string;
  selectedProvider: ProviderId;
  providerKeys: Record<ProviderId, string>;
  fireworksCustomModel: string;
}