import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';

/** Load `url` (re-runs when url changes). Returns { data, loading, error, reload, setData }. */
export function useFetch(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const reload = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      setData(await api.get(url));
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, error, reload, setData };
}
