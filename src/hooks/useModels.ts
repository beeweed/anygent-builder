import { useState, useCallback, useRef } from 'react';
import { Model, ProviderId } from '../types';
import { fetchModels } from '../utils/api';

export function useModels() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);
  const lastProviderRef = useRef<ProviderId | null>(null);

  const loadModels = useCallback(async (apiKey: string, providerId: ProviderId = 'fireworks') => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);
    fetchedRef.current = false;
    lastProviderRef.current = providerId;
    try {
      const data = await fetchModels(apiKey, providerId);
      // Only update if this is still the latest request
      if (lastProviderRef.current === providerId) {
        const sorted = data.sort((a, b) => a.name.localeCompare(b.name));
        setModels(sorted);
        fetchedRef.current = true;
      }
    } catch (err) {
      if (lastProviderRef.current === providerId) {
        setError(err instanceof Error ? err.message : 'Failed to load models');
      }
    } finally {
      if (lastProviderRef.current === providerId) {
        setLoading(false);
      }
    }
  }, []);

  const clearModels = useCallback(() => {
    setModels([]);
    setError(null);
    fetchedRef.current = false;
  }, []);

  return { models, loading, error, loadModels, clearModels };
}