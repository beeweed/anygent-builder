import { Message, Model, ProviderId, ToolCall, SystemPromptMode } from '../types';
import { getProvider } from './providers';
import { TOOL_DEFINITIONS } from './tools';
import { getSystemMessage, getCompactSystemMessage } from './systemprompt';

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

// Known/featured Fireworks models that should always be available,
// including newly released ones that may not yet appear in the OpenAI-compatible
// /v1/models listing. These act as a baseline so users can always pick them.
const FIREWORKS_FEATURED_MODELS: string[] = [
  'accounts/fireworks/models/qwen3p6-plus',
  'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507',
  'accounts/fireworks/models/qwen3-coder-480b-a35b-instruct',
  'accounts/fireworks/models/qwen3-30b-a3b',
  'accounts/fireworks/models/deepseek-v3p1',
  'accounts/fireworks/models/deepseek-v3',
  'accounts/fireworks/models/deepseek-r1',
  'accounts/fireworks/models/deepseek-r1-0528',
  'accounts/fireworks/models/kimi-k2-instruct',
  'accounts/fireworks/models/llama-v3p3-70b-instruct',
  'accounts/fireworks/models/llama4-maverick-instruct-basic',
  'accounts/fireworks/models/llama4-scout-instruct-basic',
  'accounts/fireworks/models/glm-4p5',
  'accounts/fireworks/models/glm-4p5-air',
  'accounts/fireworks/models/mixtral-8x22b-instruct',
  'accounts/fireworks/models/mixtral-8x7b-instruct',
  'accounts/fireworks/models/qwen2p5-72b-instruct',
  'accounts/fireworks/models/qwen2p5-coder-32b-instruct',
];

/**
 * Fetch ALL available Fireworks models by querying multiple endpoints and
 * merging results. We combine:
 *   1. OpenAI-compatible endpoint:   /inference/v1/models
 *   2. Fireworks account catalog:    /v1/accounts/fireworks/models?pageSize=200
 *   3. A curated featured list (so freshly released models are always selectable)
 */
async function fetchFireworksModels(apiKey: string): Promise<Model[]> {
  const modelMap = new Map<string, Model>();

  // 1) OpenAI-compatible inference endpoint
  try {
    const res = await fetch('https://api.fireworks.ai/inference/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });

    if (res.ok) {
      const data = await res.json();
      const list = (data.data || []) as Array<{
        id: string;
        owned_by?: string;
        context_length?: number;
      }>;
      for (const m of list) {
        if (!m?.id) continue;
        modelMap.set(m.id, {
          id: m.id,
          name: formatFireworksModelName(m.id),
          context_length: m.context_length,
        });
      }
    }
  } catch {
    // non-fatal; we fall back to other sources
  }

  // 2) Fireworks native account catalog (richer list of serverless models).
  //    This is paginated; we fetch a large pageSize to get them all in one call.
  try {
    const res = await fetch(
      'https://api.fireworks.ai/v1/accounts/fireworks/models?pageSize=200',
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      }
    );

    if (res.ok) {
      const data = await res.json();
      const list = (data.models || data.data || []) as Array<{
        name?: string;
        id?: string;
        displayName?: string;
        contextLength?: number;
        context_length?: number;
        kind?: string;
      }>;
      for (const m of list) {
        const id = m.name || m.id;
        if (!id || !id.startsWith('accounts/')) continue;
        if (m.kind && !/LLM|CHAT|HF_BASE_MODEL/i.test(m.kind)) continue;
        const existing = modelMap.get(id);
        modelMap.set(id, {
          id,
          name: m.displayName || existing?.name || formatFireworksModelName(id),
          context_length: m.contextLength || m.context_length || existing?.context_length,
        });
      }
    }
  } catch {
    // non-fatal
  }

  // 3) Ensure featured models are always present.
  for (const id of FIREWORKS_FEATURED_MODELS) {
    if (!modelMap.has(id)) {
      modelMap.set(id, {
        id,
        name: formatFireworksModelName(id),
      });
    }
  }

  const models = Array.from(modelMap.values()).sort((a, b) => {
    if (a.id === 'accounts/fireworks/models/qwen3p6-plus') return -1;
    if (b.id === 'accounts/fireworks/models/qwen3p6-plus') return 1;
    return a.name.localeCompare(b.name);
  });

  return models;
}

function formatFireworksModelName(modelId: string): string {
  const parts = modelId.split('/');
  const slug = parts[parts.length - 1];
  const withDots = slug.replace(/(\d)p(\d)/g, '$1.$2');
  return withDots
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

function buildApiMessages(
  messages: Message[],
  systemPromptMode: SystemPromptMode = 'big'
): ApiMessage[] {
  const systemMsg: ApiMessage =
    systemPromptMode === 'small' ? getCompactSystemMessage() : getSystemMessage();
  const converted: ApiMessage[] = messages.map((m) => {
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
  return [systemMsg, ...converted];
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
 * ROBUST SSE streaming - proper token-by-token, no compromise.
 */
export async function agentCompletion(
  apiKey: string,
  model: string,
  messages: Message[],
  callbacks: AgentCallbacks,
  providerId: ProviderId = 'openrouter',
  enableTools: boolean = true,
  systemPromptMode: SystemPromptMode = 'big',
  signal?: AbortSignal
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const provider = getProvider(providerId);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };

  if (providerId === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'Anygent Builder';
  }

  const apiMessages = buildApiMessages(messages, systemPromptMode);

  const body: Record<string, unknown> = {
    model,
    messages: apiMessages,
    stream: true,
    // Ensure OpenAI-compatible providers include usage at end
    stream_options: { include_usage: false },
  };

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
      signal,
    });
  } catch (networkErr) {
    if (signal?.aborted) return { content: '', toolCalls: [] };
    const errMsg = networkErr instanceof Error ? networkErr.message : 'Network error';
    callbacks.onError(`Network error: ${errMsg}`);
    return { content: '', toolCalls: [] };
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    const errMsg = errData?.error?.message || res.statusText;
    const statusCode = res.status;

    // If 400/422 with tools, retry without streaming/tools
    if (enableTools && (statusCode === 400 || statusCode === 422)) {
      const nonStreamResult = await tryNonStreaming(
        provider.baseUrl,
        headers,
        apiMessages,
        model,
        true,
        callbacks,
        signal
      );
      if (nonStreamResult) return nonStreamResult;

      const noToolsResult = await tryNonStreaming(
        provider.baseUrl,
        headers,
        apiMessages,
        model,
        false,
        callbacks,
        signal
      );
      if (noToolsResult) return noToolsResult;
    }

    if (statusCode === 401) {
      callbacks.onError('Invalid API key. Please check your API key in Settings.');
      return { content: '', toolCalls: [] };
    }
    if (statusCode === 402) {
      callbacks.onError('Insufficient credits. Please add credits to your account.');
      return { content: '', toolCalls: [] };
    }
    if (statusCode === 429) {
      callbacks.onError('Rate limited. Please wait a moment and try again.');
      return { content: '', toolCalls: [] };
    }

    callbacks.onError(errMsg);
    return { content: '', toolCalls: [] };
  }

  // Check content type - if JSON, the provider ignored streaming
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json') && !contentType.includes('stream')) {
    return handleJsonResponse(res, callbacks);
  }

  // Robust SSE streaming
  return handleStreamingResponse(res, callbacks, signal);
}

/**
 * Fallback: non-streaming request
 */
async function tryNonStreaming(
  baseUrl: string,
  headers: Record<string, string>,
  apiMessages: ApiMessage[],
  model: string,
  withTools: boolean,
  callbacks: AgentCallbacks,
  signal?: AbortSignal
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
      signal,
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

    if (content) {
      // Simulate streaming by chunking large content (keeps UI feel consistent)
      const chunkSize = 8;
      for (let i = 0; i < content.length; i += chunkSize) {
        callbacks.onToken(content.slice(i, i + chunkSize));
      }
    }

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
 * Handle a streaming (SSE) response - ROBUST implementation.
 *
 * Properly handles:
 *   - \r\n and \n line endings
 *   - SSE comment lines (starting with ":") used for keep-alive
 *   - Multi-line data fields (though OpenAI never sends them)
 *   - Partial UTF-8 sequences across chunks (via TextDecoder stream mode)
 *   - Malformed JSON (skipped)
 *   - Abort signals
 *   - Missing [DONE] marker
 */
async function handleStreamingResponse(
  res: Response,
  callbacks: AgentCallbacks,
  signal?: AbortSignal
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError('No response body');
    return { content: '', toolCalls: [] };
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let contentAccum = '';
  const toolCallsMap: Map<
    number,
    { id: string; type: string; function: { name: string; arguments: string } }
  > = new Map();

  // Abort handler
  const onAbort = () => {
    try {
      reader.cancel();
    } catch {
      // ignore
    }
  };
  signal?.addEventListener('abort', onAbort);

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      // Decode incrementally (stream: true preserves partial multi-byte chars)
      buffer += decoder.decode(value, { stream: true });

      // Normalize line endings - SSE uses \n but some proxies inject \r\n
      buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      // SSE events are separated by blank lines (\n\n).
      // But in practice each "data: ..." line ends with \n and we can parse per-line too,
      // because OpenAI never sends multi-line data payloads. Parse per line for robustness.
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);

        // Skip empty lines (event delimiters) and SSE comments (keep-alives)
        if (line.length === 0) continue;
        if (line.startsWith(':')) continue;

        // Only handle "data:" fields (ignore "event:", "id:", "retry:" etc.)
        if (!line.startsWith('data:')) continue;

        // Strip "data:" prefix and optional single leading space
        let payload = line.slice(5);
        if (payload.startsWith(' ')) payload = payload.slice(1);

        if (payload === '[DONE]') {
          const toolCalls = buildToolCallsFromMap(toolCallsMap);
          if (toolCalls.length > 0) callbacks.onToolCall(toolCalls);
          signal?.removeEventListener('abort', onAbort);
          return { content: contentAccum, toolCalls };
        }

        if (!payload) continue;

        try {
          const parsed = JSON.parse(payload);

          if (parsed.error) {
            callbacks.onError(parsed.error.message || 'Stream error');
            signal?.removeEventListener('abort', onAbort);
            return { content: contentAccum, toolCalls: [] };
          }

          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta || choice.message;
          if (!delta) continue;

          // Emit content token IMMEDIATELY — no buffering, no throttling
          if (typeof delta.content === 'string' && delta.content.length > 0) {
            contentAccum += delta.content;
            callbacks.onToken(delta.content);
          }

          // Some providers send `reasoning_content` (DeepSeek) — treat as content too
          if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
            contentAccum += delta.reasoning_content;
            callbacks.onToken(delta.reasoning_content);
          }

          // Tool-call deltas (OpenAI-style, incremental JSON via `arguments`)
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = typeof tc.index === 'number' ? tc.index : 0;
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
          // malformed JSON in a data chunk — skip
        }
      }
    }

    // Drain any final bytes out of the decoder
    const tail = decoder.decode();
    if (tail) buffer += tail;

    // Process any leftover in buffer (last line without trailing \n)
    if (buffer.length > 0) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data:')) {
        const payload = trimmed.slice(5).trim();
        if (payload && payload !== '[DONE]') {
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              contentAccum += delta.content;
              callbacks.onToken(delta.content);
            }
          } catch {
            // skip
          }
        }
      }
    }
  } catch (err) {
    signal?.removeEventListener('abort', onAbort);
    if (signal?.aborted) {
      return { content: contentAccum, toolCalls: buildToolCallsFromMap(toolCallsMap) };
    }
    if (contentAccum) {
      return { content: contentAccum, toolCalls: buildToolCallsFromMap(toolCallsMap) };
    }
    const errMsg = err instanceof Error ? err.message : 'Stream read error';
    callbacks.onError(errMsg);
    return { content: '', toolCalls: [] };
  }

  signal?.removeEventListener('abort', onAbort);
  const toolCalls = buildToolCallsFromMap(toolCallsMap);
  if (toolCalls.length > 0) callbacks.onToolCall(toolCalls);
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

// ─── Legacy streaming (kept for backward compat) ────────────────────────────

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
    false
  );
  onDone();
}