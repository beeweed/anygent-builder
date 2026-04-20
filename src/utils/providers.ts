import { ProviderConfig, ProviderId } from '../types';

/**
 * Providers supported by Anygent Builder.
 *
 * After the migration to the Vercel AI SDK the agent only uses
 * Fireworks as the inference provider (via @ai-sdk/fireworks).
 */
export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    description: 'High-speed inference with Fireworks AI — powered by the Vercel AI SDK',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    placeholder: 'fw_...',
  },
];

export function getProvider(id: ProviderId): ProviderConfig {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];
}