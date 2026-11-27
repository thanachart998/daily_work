import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

/** โหลดข้อมูลแบบ async และโหลดใหม่อัตโนมัติเมื่อข้อมูลงานเปลี่ยน */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const { dataVersion } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    run()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [run, dataVersion]);

  return { data, error, loading };
}
