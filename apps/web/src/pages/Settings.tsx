import { useState } from 'react'
import { api } from '../api'
import { useApi } from '../hooks'
import { Badge, Button, Card, ErrorNote, Input, Notice, PageHeader, Skeleton } from '../ui'

interface S { llmProvider: string; llmModel: string; hasKey: boolean; keyLast4: string | null; keyMasked: string | null; keySource: 'settings' | 'environment' | 'none' }

export default function Settings() {
  const { data, error, reload } = useApi<S>('/settings')
  const [key, setKey] = useState('')
  const [model, setModel] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg(null)
    try { await fn(); setMsg({ ok: true, text: ok }); setKey(''); reload() } catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
    setBusy(false)
  }
  if (!data) return error ? <ErrorNote error={error} /> : <div className="max-w-xl space-y-6" aria-busy="true"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title="Settings" description="Document extraction uses this provider. The agent on the home page never does." />
      <Card title="LLM provider">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">Claude (Anthropic)</span>
            {data.keySource === 'settings' ? <Badge value="resolved" /> : <Badge value={data.keySource === 'environment' ? 'assigned' : 'rejected'} />}
            <span className="text-slate-500">{data.keySource === 'settings' ? `Key saved · ends in ${data.keyLast4}` : data.keySource === 'environment' ? 'Using server environment key' : 'No key configured'}</span>
          </div>
          <label className="block text-sm"><span className="mb-2 block font-medium">API key</span>
            <Input type="password" autoComplete="off" placeholder={data.keyMasked ?? 'sk-ant-…'} value={key} onChange={(e) => setKey(e.target.value)} />
            <span className="mt-2 block text-xs text-slate-500">Stored encrypted on the server and never shown again. Enter a new key to replace the saved one.</span>
          </label>
          <label className="block text-sm"><span className="mb-2 block font-medium">Model</span>
            <Input value={model ?? data.llmModel} onChange={(e) => setModel(e.target.value)} />
          </label>
          {msg && (msg.ok ? <Notice tone="success">{msg.text}</Notice> : <ErrorNote error={msg.text} />)}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || (!key && model === null)} onClick={() => run(() => api('/settings', { method: 'PUT', body: { ...(key && { llmApiKey: key }), ...(model !== null && { llmModel: model }) } }), 'Saved')}>Save</Button>
            <Button variant="ghost" disabled={busy} onClick={() => run(() => api('/settings/test', { method: 'POST', body: {} }), 'Connection works')}>Test connection</Button>
            {data.keySource === 'settings' && <Button variant="danger" disabled={busy} onClick={() => run(() => api('/settings', { method: 'PUT', body: { clearKey: true } }), 'Key removed')}>Remove key</Button>}
          </div>
        </div>
      </Card>
    </div>
  )
}
