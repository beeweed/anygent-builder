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
  apiKey: string;
  selectedModel: string;
  selectedProvider: ProviderId;
  providerKeys: Record<ProviderId, string>;
  fireworksCustomModel: string;
}