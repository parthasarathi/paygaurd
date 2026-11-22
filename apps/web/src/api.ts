const TOKEN_KEY = 'token'
export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY))

export async function api<T>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.authorization = `Bearer ${token}`
  if (opts.body) headers['content-type'] = 'application/json'
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
    headers,
    body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && path !== '/auth/login') { setToken(null); location.href = '/login' }
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
  return data as T
}

export const money = (minor: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(minor / 100)


export async function fetchDocumentBlob(id: string): Promise<Blob> {
  const token = getToken()
  const res = await fetch(`/api/documents/${id}/file`, { headers: token ? { authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new Error(res.status === 404 ? 'File is no longer available' : `Could not load file (${res.status})`)
  return res.blob()
}
