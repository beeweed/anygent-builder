/**
 * Anygent Builder — Agent core.
 *
 * This module implements a fully-streaming ReAct (Reason + Act) agent
 * powered by the Vercel AI SDK and the Fireworks provider
 * (@ai-sdk/fireworks).
 *
 *   • Real-time token streaming via `streamText().textStream`.
 *   • Native tool calling via the Vercel AI SDK `tools` parameter
 *     (Zod-validated inputs).
 *   • ReAct loop is driven from `App.tsx`: each iteration invokes
 *     `agentCompletion()` once, we stream tokens + collect tool calls,
 *     the UI executes the tools, and the resulting tool messages are
 *     appended to history for the next iteration.
 */

import { streamText, type ModelMessage } from 'ai';
import { createFireworks } from '@ai-sdk/fireworks';
import { Message, Model, ProviderId, ToolCall, SystemPromptMode } from '../types';
import { TOOL_DEFINITIONS } from './tools';
import { getSystemMessage, getCompactSystemMessage } from './systemprompt';

// ─── Model Listing ──────────────────────────────────────────────────────────

export async function fetchModels(
  apiKey: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _providerId: ProviderId = 'fireworks'
): Promise<Model[]> {
  return fetchFireworksModels(apiKey);
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

// ─── Message Conversion (internal → Vercel AI SDK) ──────────────────────────

/**
 * Convert our internal Message[] (plus a system prompt) into the
 * `ModelMessage[]` shape expected by the Vercel AI SDK.
 *
 * The Vercel AI SDK expects:
 *   - system:     { role: 'system', content: string }
 *   - user:       { role: 'user', content: string | parts[] }
 *   - assistant:  { role: 'assistant', content: string | parts[] }
 *                 parts may include { type: 'tool-call', toolCallId, toolName, input }
 *   - tool:       { role: 'tool', content: [{ type: 'tool-result', toolCallId, toolName, output }] }
 */
function buildModelMessages(
  messages: Message[],
  systemPromptMode: SystemPromptMode = 'big'
): ModelMessage[] {
  const systemMsg =
    systemPromptMode === 'small' ? getCompactSystemMessage() : getSystemMessage();

  const converted: ModelMessage[] = [
    { role: 'system', content: systemMsg.content },
  ];

  for (const m of messages) {
    if (m.role === 'user') {
      converted.push({ role: 'user', content: m.content });
      continue;
    }

    if (m.role === 'assistant') {
      if (m.tool_calls && m.tool_calls.length > 0) {
        // Assistant message with tool calls → content parts
        const parts: Array<
          | { type: 'text'; text: string }
          | {
              type: 'tool-call';
              toolCallId: string;
              toolName: string;
              input: unknown;
            }
        > = [];

        if (m.content && m.content.length > 0) {
          parts.push({ type: 'text', text: m.content });
        }

        for (const tc of m.tool_calls) {
          let parsedArgs: unknown = {};
          try {
            parsedArgs = tc.function.arguments
              ? JSON.parse(tc.function.arguments)
              : {};
          } catch {
            parsedArgs = {};
          }
          parts.push({
            type: 'tool-call',
            toolCallId: tc.id,
            toolName: tc.function.name,
            input: parsedArgs,
          });
        }

        converted.push({
          role: 'assistant',
          content: parts,
        } as ModelMessage);
      } else {
        converted.push({
          role: 'assistant',
          content: m.content || '',
        });
      }
      continue;
    }

    if (m.role === 'tool') {
      converted.push({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: m.tool_call_id || '',
            toolName: m.tool_name || 'unknown',
            output: { type: 'text', value: m.content },
          },
        ],
      } as ModelMessage);
      continue;
    }
  }

  return converted;
}

// ─── Agent Completion (single turn of the ReAct loop) ───────────────────────

export interface AgentCallbacks {
  onToken: (token: string) => void;
  onToolCall: (toolCalls: ToolCall[]) => void;
  onDone: () => void;
  onError: (err: string) => void;
}

/**
 * Run a single completion turn. Streams assistant tokens in real time via
 * Vercel AI SDK's `streamText`, and collects any tool calls the model emits.
 *
 * The outer ReAct loop lives in `App.tsx`: after this function returns any
 * tool calls, the UI executes them locally (file_read/file_write), appends
 * the tool results to history, and calls `agentCompletion()` again.
 */
export async function agentCompletion(
  apiKey: string,
  model: string,
  messages: Message[],
  callbacks: AgentCallbacks,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _providerId: ProviderId = 'fireworks',
  enableTools: boolean = true,
  systemPromptMode: SystemPromptMode = 'big',
  signal?: AbortSignal
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const modelMessages = buildModelMessages(messages, systemPromptMode);

  const fireworks = createFireworks({ apiKey });

  const tools = enableTools ? TOOL_DEFINITIONS : undefined;

  let accumulated = '';
  const toolCalls: ToolCall[] = [];

  try {
    const result = streamText({
      model: fireworks(model),
      messages: modelMessages,
      tools,
      // We never loop inside streamText itself — our ReAct loop in App.tsx
      // handles subsequent turns after tool execution.
      stopWhen: undefined,
      abortSignal: signal,
    });

    // Walk the full event stream: we get text deltas, tool-call events,
    // finish events, and errors — all through one unified iterator.
    for await (const part of result.fullStream) {
      if (signal?.aborted) break;

      switch (part.type) {
        case 'text-delta': {
          // In ai v6 the incremental text field is `text`.
          // Fallback to `textDelta` if the runtime version differs.
          const delta =
            // @ts-expect-error — support both shapes across SDK versions
            (part.text as string | undefined) ?? (part.textDelta as string | undefined) ?? '';
          if (delta) {
            accumulated += delta;
            callbacks.onToken(delta);
          }
          break;
        }

        case 'reasoning-delta': {
          // Some reasoning models expose a separate reasoning stream —
          // surface it to the UI as ordinary tokens so users can see the
          // model "think" in real time.
          const delta =
            // @ts-expect-error — support both shapes across SDK versions
            (part.text as string | undefined) ?? (part.textDelta as string | undefined) ?? '';
          if (delta) {
            accumulated += delta;
            callbacks.onToken(delta);
          }
          break;
        }

        case 'tool-call': {
          const p = part as unknown as {
            toolCallId: string;
            toolName: string;
            input?: unknown;
            args?: unknown;
          };
          const rawArgs = p.input ?? p.args ?? {};
          const argsStr =
            typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs);
          toolCalls.push({
            id: p.toolCallId,
            type: 'function',
            function: {
              name: p.toolName,
              arguments: argsStr,
            },
          });
          break;
        }

        case 'error': {
          const err = (part as unknown as { error: unknown }).error;
          const msg =
            err instanceof Error
              ? err.message
              : typeof err === 'string'
                ? err
                : 'Stream error';
          callbacks.onError(msg);
          return { content: accumulated, toolCalls };
        }

        case 'finish':
        case 'finish-step':
          // handled via final awaits below
          break;

        default:
          break;
      }
    }

    if (toolCalls.length > 0) {
      callbacks.onToolCall(toolCalls);
    }

    return { content: accumulated, toolCalls };
  } catch (err) {
    if (signal?.aborted) {
      return { content: accumulated, toolCalls };
    }
    const msg = extractErrorMessage(err);
    callbacks.onError(msg);
    return { content: accumulated, toolCalls };
  }
}

function extractErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  if (err instanceof Error) {
    // Vercel AI SDK errors often carry rich metadata on `cause` / `data`.
    const anyErr = err as Error & {
      statusCode?: number;
      data?: { error?: { message?: string } };
    };
    if (anyErr.statusCode === 401) {
      return 'Invalid API key. Please check your Fireworks API key in Settings.';
    }
    if (anyErr.statusCode === 402) {
      return 'Insufficient credits. Please add credits to your Fireworks account.';
    }
    if (anyErr.statusCode === 429) {
      return 'Rate limited. Please wait a moment and try again.';
    }
    if (anyErr.data?.error?.message) {
      return anyErr.data.error.message;
    }
    return err.message;
  }
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

// ─── Legacy streaming (kept for backward compat) ────────────────────────────

export async function streamCompletion(
  apiKey: string,
  model: string,
  messages: Message[],
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  providerId: ProviderId = 'fireworks'
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