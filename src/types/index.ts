export interface ToolCallFunction {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: ToolCallFunction;
}

export interface ToolResult {
  tool_call_id: string;
  name: string;
  result: string;
  success: boolean;
  file_path?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  tool_name?: string;
  tool_result?: ToolResult;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  provider: ProviderId;
  createdAt: number;
  updatedAt: number;
  sandboxId?: string | null;
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

export type ThemeMode = 'dark' | 'light';

export type SystemPromptMode = 'big' | 'small';

export interface AppSettings {
  apiKey: string;
  selectedModel: string;
  selectedProvider: ProviderId;
  providerKeys: Record<ProviderId, string>;
  fireworksCustomModel: string;
  e2bApiKey: string;
  e2bTemplate: string;
  theme: ThemeMode;
  systemPromptMode: SystemPromptMode;
}

export type SandboxStatus = 'idle' | 'creating' | 'running' | 'error' | 'destroying';

export interface SandboxState {
  status: SandboxStatus;
  sandboxId: string | null;
  error: string | null;
}