import { Message, Model, ProviderId } from '../types';
import { getProvider } from './providers';

export async function fetchModels(apiKey: string, providerId: ProviderId = 'openrouter'): Promise<Model[]> {
  const provider = getProvider(providerId);

  if (providerId === 'fireworks') {
    return fetchFireworksModels(apiKey);
  }

  // OpenRouter
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
  // Fireworks uses the OpenAI-compatible /models endpoint
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
  // Model IDs look like "accounts/fireworks/models/llama-v3p3-70b-instruct"
  // Extract the last part and make it readable
  const parts = modelId.split('/');
  const name = parts[parts.length - 1];
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function streamCompletion(
  apiKey: string,
  model: string,
  messages: Message[],
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  providerId: ProviderId = 'openrouter'
): Promise<void> {
  const provider = getProvider(providerId);

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    if (providerId === 'openrouter') {
      headers['HTTP-Referer'] = window.location.origin;
      headers['X-Title'] = 'Anygent Builder';
    }

    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: { message: res.statusText } }));
      onError(errData?.error?.message || res.statusText);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      onError('No response body');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

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
          onDone();
          return;
        }
        try {
          const parsed = JSON.parse(payload);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) onToken(token);
        } catch {
          // skip malformed chunks
        }
      }
    }

    onDone();
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Unknown error');
  }
}