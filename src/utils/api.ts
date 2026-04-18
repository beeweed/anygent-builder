import { Message, Model, ProviderId, ToolCall } from '../types';
import { getProvider } from './providers';
import { TOOL_DEFINITIONS } from './tools';

export async function fetchModels(apiKey: string, providerId: ProviderId = 'openrouter'): Promise<Model[]> {
  const provider = getProvider(providerId);

  if (providerId === 'fireworks') {
    return fetchFireworksModels(apiKey);
  }

  const res = await fetch(`${provider.baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.statusText}`);
  const data = await res.json();
  return data.data as Model[];
}

async function fetchFireworksModels(apiKey: string): Promise<Model[]> {
  const res = await fetch('https://api.fireworks.ai/inference/v1/models', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Fireworks models: ${res.statusText}`);
  }

  const data = await res.json();
  const models: Model[] = (data.data || []).map((m: { id: string; owned_by?: string; context_length?: number }) => ({
    id: m.id,
    name: formatFireworksModelName(m.id),
    context_length: m.context_length,
  }));

  return models;
}

function formatFireworksModelName(modelId: string): string {
  const parts = modelId.split('/');
  const name = parts[parts.length - 1];
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Build API messages from our Message type ───────────────────────────────

interface ApiMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

function buildApiMessages(messages: Message[]): ApiMessage[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return {
        role: 'tool' as const,
        content: m.content,
        tool_call_id: m.tool_call_id || '',
      };
    }
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      return {
        role: 'assistant' as const,
        content: m.content || null,
        tool_calls: m.tool_calls,
      };
    }
    return {
      role: m.role as 'user' | 'assistant',
      content: m.content,
    };
  });
}

// ─── Agent Completion (ReAct loop with tool calling) ────────────────────────

export interface AgentCallbacks {
  onToken: (token: string) => void;
  onToolCall: (toolCalls: ToolCall[]) => void;
  onDone: () => void;
  onError: (err: string) => void;
}

/**
 * Single-turn completion that may return streamed text OR tool_calls.
 * Returns { content, toolCalls } when done.
 */
export async function agentCompletion(
  apiKey: string,
  model: string,
  messages: Message[],
  callbacks: AgentCallbacks,
  providerId: ProviderId = 'openrouter'
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const provider = getProvider(providerId);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  if (providerId === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'Anygent Builder';
  }

  const apiMessages = buildApiMessages(messages);

  const body: Record<string, unknown> = {
    model,
    messages: apiMessages,
    stream: true,
    tools: TOOL_DEFINITIONS,
    tool_choice: 'auto',
  };

  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: { message: res.statusText } }));
    const errMsg = errData?.error?.message || res.statusText;
    callbacks.onError(errMsg);
    return { content: '', toolCalls: [] };
  }

  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError('No response body');
    return { content: '', toolCalls: [] };
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let contentAccum = '';
  const toolCallsMap: Map<number, { id: string; type: string; function: { name: string; arguments: string } }> = new Map();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') {
        // Stream finished
        const toolCalls = buildToolCallsFromMap(toolCallsMap);
        if (toolCalls.length > 0) {
          callbacks.onToolCall(toolCalls);
        }
        return { content: contentAccum, toolCalls };
      }

      try {
        const parsed = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        // Handle content tokens
        if (delta.content) {
          contentAccum += delta.content;
          callbacks.onToken(delta.content);
        }

        // Handle tool_calls deltas
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallsMap.has(idx)) {
              toolCallsMap.set(idx, {
                id: tc.id || '',
                type: tc.type || 'function',
                function: { name: '', arguments: '' },
              });
            }
            const existing = toolCallsMap.get(idx)!;
            if (tc.id) existing.id = tc.id;
            if (tc.type) existing.type = tc.type;
            if (tc.function?.name) existing.function.name += tc.function.name;
            if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
          }
        }
      } catch {
        // skip malformed chunks
      }
    }
  }

  // If we get here without [DONE], finalize
  const toolCalls = buildToolCallsFromMap(toolCallsMap);
  if (toolCalls.length > 0) {
    callbacks.onToolCall(toolCalls);
  }
  return { content: contentAccum, toolCalls };
}

function buildToolCallsFromMap(
  map: Map<number, { id: string; type: string; function: { name: string; arguments: string } }>
): ToolCall[] {
  if (map.size === 0) return [];
  const result: ToolCall[] = [];
  const sorted = [...map.entries()].sort((a, b) => a[0] - b[0]);
  for (const [, val] of sorted) {
    result.push({
      id: val.id,
      type: 'function',
      function: {
        name: val.function.name,
        arguments: val.function.arguments,
      },
    });
  }
  return result;
}

// ─── Legacy streaming (kept for backward compat if needed) ──────────────────

export async function streamCompletion(
  apiKey: string,
  model: string,
  messages: Message[],
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  providerId: ProviderId = 'openrouter'
): Promise<void> {
  await agentCompletion(
    apiKey,
    model,
    messages,
    {
      onToken,
      onToolCall: () => {},
      onDone,
      onError,
    },
    providerId
  );
  onDone();
}