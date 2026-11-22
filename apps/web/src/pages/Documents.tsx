import { Eye, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useApi } from '../hooks'
import { PdfPreview, type PreviewTarget } from '../PdfPreview'
import { Badge, Button, Card, Empty, ErrorNote, Notice, PageHeader, Skeleton } from '../ui'

interface Doc { source: string; sourceRef: string | null; id: string; kind: string; filename: string; status: string; error: string | null; createdAt: string }

export default function Documents() {
  const { data, error, reload } = useApi<Doc[]>('/documents')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewTarget | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true); setErr(null); setMsg(null)
    // Upload contracts before invoices so rates exist when the invoice is checked.
    const sorted = [...files].sort((a, b) => Number(/inv/i.test(a.name)) - Number(/inv/i.test(b.name)))
    let flags = 0
    try {
      for (const f of sorted) {
        const form = new FormData(); form.append('file', f)
        const r = await api<{ flagsCreated?: number }>('/documents', { form })
        flags += r.flagsCreated ?? 0
      }
      setMsg(`Processed ${files.length} file(s). ${flags} new flag(s).`)
    } catch (e) { setErr((e as Error).message) }
    setBusy(false); reload(); if (input.current) input.current.value = ''
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Upload documents" description="Contracts and invoices as PDFs. Each one is checked for duplicates and rate drift." />
      <Card>
        <p className="mb-4 max-w-prose text-sm text-slate-600">Upload here, or connect email, a folder or the API under Integrations. Fields are extracted with your configured LLM, then checked for duplicates and rate drift.</p>
        <input ref={input} type="file" accept="application/pdf" multiple hidden onChange={(e) => upload(e.target.files)} />
        <Button disabled={busy} onClick={() => input.current?.click()}><Upload size={20} />{busy ? 'Extracting… this can take a minute' : 'Choose PDFs'}</Button>
        <div className="mt-4 space-y-2">
          <ErrorNote error={err} />
          {err?.includes('Settings') && <Link to="/settings" className="text-sm text-brand-700 underline underline-offset-2">Go to Settings</Link>}
          {msg && <Notice tone="success">{msg} <Link to="/flags" className="underline">View flags</Link></Notice>}
        </div>
      </Card>
      <Card title="Documents">
        <ErrorNote error={error} />
        {!data && !error && <div className="space-y-2" aria-busy="true"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>}
        {data && data.length === 0 ? <Empty>Nothing uploaded yet.</Empty> : data && (
          <ul className="divide-y divide-slate-100">
            {data?.map((d) => (
              <li key={d.id} className="flex min-h-12 items-center justify-between gap-4 py-2 text-sm"><span className="min-w-0">{d.filename} <span className="text-slate-500">· {d.kind} · via {d.source}{d.sourceRef ? ` (${d.sourceRef})` : ''}</span>{d.error && <span className="block text-xs text-red-700">{d.error}</span>}</span><span className="flex shrink-0 items-center gap-4"><Button size="sm" variant="ghost" onClick={() => setPreview({ id: d.id, title: d.filename })}><Eye size={16} />Preview</Button><Badge value={d.status === 'extracted' ? 'resolved' : d.status === 'failed' ? 'rejected' : 'open'} /></span></li>
            ))}
          </ul>
        )}
      </Card>
      {preview && <PdfPreview target={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}
