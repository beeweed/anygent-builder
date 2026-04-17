import { useState, useCallback, useRef } from 'react';
import { Model } from '../types';
import { fetchModels } from '../utils/api';

export function useModels() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const loadModels = useCallback(async (apiKey: string) => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);
    fetchedRef.current = false;
    try {
      const data = await fetchModels(apiKey);
      const sorted = data.sort((a, b) => a.name.localeCompare(b.name));
      setModels(sorted);
      fetchedRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models');
    } finally {
      setLoading(false);
    }
  }, []);

  return { models, loading, error, loadModels };
}
