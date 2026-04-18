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

  // Normalize model data - ensure each model has a name
  const raw = (data.data || []) as Array<Record<string, unknown>>;
  return raw.map((m) => ({
    id: (m.id as string) || '',
    name: (m.name as string) || (m.id as string) || 'Unknown',
    context_length: (m.context_length as number) || undefined,
    pricing: m.pricing as Model['pricing'],
  }));
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
 * Uses streaming by default, falls back to non-streaming if streaming fails.
 * Returns { content, toolCalls } when done.
 */
export async function agentCompletion(
  apiKey: string,
  model: string,
  messages: Message[],
  callbacks: AgentCallbacks,
  providerId: ProviderId = 'openrouter',
  enableTools: boolean = true
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

  // Try streaming first
  const body: Record<string, unknown> = {
    model,
    messages: apiMessages,
    stream: true,
  };

  // Only include tools if enabled
  if (enableTools) {
    body.tools = TOOL_DEFINITIONS;
    body.tool_choice = 'auto';
  }

  let res: Response;
  try {
    res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    const errMsg = networkErr instanceof Error ? networkErr.message : 'Network error';
    callbacks.onError(`Network error: ${errMsg}`);
    return { content: '', toolCalls: [] };
  }

  // If streaming with tools fails, retry without streaming
  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    const errMsg = errData?.error?.message || res.statusText;
    const statusCode = res.status;

    // If 400/422 and we have tools, it might be that the model doesn't support tools+streaming
    // Try non-streaming, then try without tools
    if (enableTools && (statusCode === 400 || statusCode === 422)) {
      // Attempt 1: non-streaming with tools
      const nonStreamResult = await tryNonStreaming(
        provider.baseUrl,
        headers,
        apiMessages,
        model,
        true, // with tools
        callbacks
      );
      if (nonStreamResult) return nonStreamResult;

      // Attempt 2: non-streaming without tools
      const noToolsResult = await tryNonStreaming(
        provider.baseUrl,
        headers,
        apiMessages,
        model,
        false, // without tools
        callbacks
      );
      if (noToolsResult) return noToolsResult;
    }

    // If 401, it's an auth error
    if (statusCode === 401) {
      callbacks.onError('Invalid API key. Please check your API key in Settings.');
      return { content: '', toolCalls: [] };
    }

    // If 402, insufficient credits
    if (statusCode === 402) {
      callbacks.onError('Insufficient credits. Please add credits to your account.');
      return { content: '', toolCalls: [] };
    }

    // If 429, rate limited
    if (statusCode === 429) {
      callbacks.onError('Rate limited. Please wait a moment and try again.');
      return { content: '', toolCalls: [] };
    }

    callbacks.onError(errMsg);
    return { content: '', toolCalls: [] };
  }

  // Check content type - some responses might not be streaming even if we asked
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    // Non-streaming response returned despite stream: true
    return handleJsonResponse(res, callbacks);
  }

  // Handle streaming response
  return handleStreamingResponse(res, callbacks);
}

/**
 * Try a non-streaming request as fallback
 */
async function tryNonStreaming(
  baseUrl: string,
  headers: Record<string, string>,
  apiMessages: ApiMessage[],
  model: string,
  withTools: boolean,
  callbacks: AgentCallbacks
): Promise<{ content: string; toolCalls: ToolCall[] } | null> {
  const body: Record<string, unknown> = {
    model,
    messages: apiMessages,
    stream: false,
  };

  if (withTools) {
    body.tools = TOOL_DEFINITIONS;
    body.tool_choice = 'auto';
  }

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;

    return handleJsonResponse(res, callbacks);
  } catch {
    return null;
  }
}

/**
 * Handle a JSON (non-streaming) response
 */
async function handleJsonResponse(
  res: Response,
  callbacks: AgentCallbacks
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  try {
    const data = await res.json();
    const choice = data.choices?.[0];

    if (!choice) {
      callbacks.onError('No response from model');
      return { content: '', toolCalls: [] };
    }

    const message = choice.message || choice.delta || {};
    const content = message.content || '';
    const rawToolCalls = message.tool_calls || [];

    // Emit content as a single token
    if (content) {
      callbacks.onToken(content);
    }

    // Parse tool calls
    const toolCalls: ToolCall[] = rawToolCalls.map((tc: Record<string, unknown>) => ({
      id: (tc.id as string) || `tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'function' as const,
      function: {
        name: (tc.function as Record<string, string>)?.name || '',
        arguments: (tc.function as Record<string, string>)?.arguments || '{}',
      },
    }));

    if (toolCalls.length > 0) {
      callbacks.onToolCall(toolCalls);
    }

    return { content, toolCalls };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Failed to parse response';
    callbacks.onError(errMsg);
    return { content: '', toolCalls: [] };
  }
}

/**
 * Handle a streaming (SSE) response
 */
async function handleStreamingResponse(
  res: Response,
  callbacks: AgentCallbacks
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError('No response body');
    return { content: '', toolCalls: [] };
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let contentAccum = '';
  const toolCallsMap: Map<number, { id: string; type: string; function: { name: string; arguments: string } }> = new Map();

  try {
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
          const toolCalls = buildToolCallsFromMap(toolCallsMap);
          if (toolCalls.length > 0) {
            callbacks.onToolCall(toolCalls);
          }
          return { content: contentAccum, toolCalls };
        }

        try {
          const parsed = JSON.parse(payload);

          // Check for error in the stream
          if (parsed.error) {
            callbacks.onError(parsed.error.message || 'Stream error');
            return { content: contentAccum, toolCalls: [] };
          }

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
                  id: tc.id || `tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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
  } catch (err) {
    // Stream read error - return what we have
    if (contentAccum) {
      return { content: contentAccum, toolCalls: buildToolCallsFromMap(toolCallsMap) };
    }
    const errMsg = err instanceof Error ? err.message : 'Stream read error';
    callbacks.onError(errMsg);
    return { content: '', toolCalls: [] };
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
    providerId,
    false // no tools for simple streaming
  );
  onDone();
}