import { useState } from 'react'
import { api } from '../api'
import { useApi } from '../hooks'
import { Badge, Button, Card, ErrorNote, Input, Notice, PageHeader, Skeleton } from '../ui'

interface Info {
  apiKeys: { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }[]
  webhook: { url: string | null; hasSecret: boolean }
  email: { enabled: boolean; host: string | null; port: number; user: string | null; folder: string; hasPassword: boolean; lastPollAt: string | null; lastError: string | null }
  folder: { path: string }
}

const Code = ({ children }: { children: string }) => <pre className="overflow-x-auto rounded-md bg-slate-900 p-4 text-xs text-slate-100">{children}</pre>

export default function Integrations() {
  const { data, error, reload } = useApi<Info>('/integrations')
  const [keyName, setKeyName] = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)
  const [hook, setHook] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [mail, setMail] = useState({ host: '', port: '993', user: '', password: '', folder: 'INBOX' })
  const [mailInit, setMailInit] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  if (!data) return error ? <ErrorNote error={error} /> : <div className="max-w-3xl space-y-6" aria-busy="true"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>
  if (!mailInit) { setMail({ host: data.email.host ?? '', port: String(data.email.port), user: data.email.user ?? '', password: '', folder: data.email.folder }); setMailInit(true) }

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null)
    try { await fn(); setMsg({ ok: true, text: ok }); reload() } catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
  }
  const origin = window.location.origin

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Integrations" description="Every source below feeds the same pipeline: extract, check for duplicates and rate drift, then flag." />
      {msg && (msg.ok ? <Notice tone="success">{msg.text}</Notice> : <ErrorNote error={msg.text} />)}

      <Card title="API & webhook">
        <div className="space-y-6">
          <p className="text-sm text-slate-600">Send documents from any system with an API key. The response includes the flags found, each with the evidence reference.</p>
          <Code>{`curl -X POST ${origin}/api/v1/documents \\\n  -H "x-api-key: YOUR_KEY" \\\n  -F "file=@invoice.pdf"`}</Code>
          <ul className="divide-y divide-slate-100 text-sm">
            {data.apiKeys.map((k) => (
              <li key={k.id} className="flex min-h-12 items-center justify-between gap-4 py-2"><span className="min-w-0"><span className="font-medium">{k.name}</span> <span className="text-slate-600">{k.prefix}… · {k.lastUsedAt ? `used ${new Date(k.lastUsedAt).toLocaleString()}` : 'never used'}</span></span>
                <Button size="sm" variant="ghost" onClick={() => run(() => api(`/integrations/api-keys/${k.id}`, { method: 'DELETE' }), 'Key revoked')}>Revoke</Button></li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2"><Input className="min-w-48 flex-1" placeholder="Key name, e.g. SAP production" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
            <Button disabled={!keyName} onClick={() => run(async () => { const r = await api<{ key: string }>('/integrations/api-keys', { body: { name: keyName } }); setNewKey(r.key); setKeyName('') }, 'Key created')}>Create key</Button></div>
          {newKey && <div className="rounded-md bg-amber-50 p-4 text-sm"><div className="font-medium text-amber-800">Copy this key now — it won't be shown again.</div><code className="break-all">{newKey}</code></div>}

          <div className="border-t border-slate-100 pt-6">
            <div className="mb-2 text-sm font-medium">Result webhook</div>
            <p className="mb-2 text-xs text-slate-600">We POST a JSON result for every processed document, signed with <code>x-payguard-signature: sha256=HMAC(body)</code>.</p>
            <Input placeholder="https://your-system.example.com/payguard" value={hook ?? data.webhook.url ?? ''} onChange={(e) => setHook(e.target.value)} />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => run(async () => { const r = await api<{ secret: string | null }>('/integrations/webhook', { method: 'PUT', body: { url: (hook ?? data.webhook.url) || null, regenerateSecret: !data.webhook.hasSecret } }); setSecret(r.secret) }, 'Webhook saved')}>Save</Button>
              {data.webhook.url && <Button variant="ghost" onClick={() => run(() => api('/integrations/webhook', { method: 'PUT', body: { url: null } }), 'Webhook removed')}>Remove</Button>}
              {data.webhook.url && <Button variant="ghost" onClick={() => run(async () => { const r = await api<{ secret: string | null }>('/integrations/webhook', { method: 'PUT', body: { url: data.webhook.url, regenerateSecret: true } }); setSecret(r.secret) }, 'Secret regenerated')}>New secret</Button>}
            </div>
            {secret && <div className="mt-4 rounded-md bg-amber-50 p-4 text-sm"><div className="font-medium text-amber-800">Signing secret (shown once)</div><code className="break-all">{secret}</code></div>}
          </div>
        </div>
      </Card>

      <Card title="Email inbox (IMAP)" action={<Badge value={data.email.enabled ? 'resolved' : 'dismissed'} />}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Forward vendor invoices to a dedicated mailbox. PDF attachments in unread mail are checked every minute, then the mail is marked read. Use an app password.</p>
          <div className="grid grid-cols-3 gap-2">
            <Input className="col-span-2" placeholder="imap.gmail.com" value={mail.host} onChange={(e) => setMail({ ...mail, host: e.target.value })} />
            <Input placeholder="993" value={mail.port} onChange={(e) => setMail({ ...mail, port: e.target.value })} />
            <Input className="col-span-2" placeholder="Username" value={mail.user} onChange={(e) => setMail({ ...mail, user: e.target.value })} />
            <Input placeholder="Folder" value={mail.folder} onChange={(e) => setMail({ ...mail, folder: e.target.value })} />
            <Input className="col-span-3" type="password" autoComplete="off" placeholder={data.email.hasPassword ? 'Password saved — enter to replace' : 'App password'} value={mail.password} onChange={(e) => setMail({ ...mail, password: e.target.value })} />
          </div>
          {data.email.lastPollAt && <p className="text-xs text-slate-600">Last checked {new Date(data.email.lastPollAt).toLocaleString()}{data.email.lastError && <span className="text-red-700"> · {data.email.lastError}</span>}</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run(() => api('/integrations/email', { method: 'PUT', body: { enabled: true, host: mail.host, port: Number(mail.port) || 993, user: mail.user, folder: mail.folder, ...(mail.password && { password: mail.password }) } }), 'Email enabled')}>Save & enable</Button>
            {data.email.hasPassword && <Button variant="ghost" onClick={() => run(async () => { const r = await api<{ messages: number; documents: number }>('/integrations/email/poll', { body: {} }); setMsg({ ok: true, text: `Checked mailbox: ${r.messages} message(s), ${r.documents} document(s)` }) }, 'Mailbox checked')}>Check now</Button>}
            {data.email.enabled && <Button variant="ghost" onClick={() => run(() => api('/integrations/email', { method: 'PUT', body: { enabled: false } }), 'Email disabled')}>Disable</Button>}
          </div>
        </div>
      </Card>

      <Card title="Watched folder / cloud drive">
        <p className="mb-4 text-sm text-slate-600">PDFs dropped in this folder are processed every 10 seconds and moved to <code>processed/</code> or <code>failed/</code>. Point it at a folder synced by Google Drive, Dropbox or OneDrive to ingest from the cloud.</p>
        <Code>{data.folder.path}</Code>
        <p className="mt-4 text-xs text-slate-600">Change the location with the <code>WATCH_DIR</code> environment variable on the server.</p>
      </Card>
    </div>
  )
}
