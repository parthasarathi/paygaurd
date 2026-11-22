import { useCallback, useEffect, useState } from 'react'
import { api } from './api'

export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => api<T>(path).then((d) => { setData(d); setError(null) }).catch((e) => setError(e.message)), [path])
  useEffect(() => { load() }, [load])
  return { data, error, reload: load }
}
