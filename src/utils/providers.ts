import { ProviderConfig, ProviderId } from '../types';

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access 200+ models via OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    placeholder: 'sk-or-...',
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    description: 'High-speed inference with Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    placeholder: 'fw_...',
  },
];

export function getProvider(id: ProviderId): ProviderConfig {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];
}