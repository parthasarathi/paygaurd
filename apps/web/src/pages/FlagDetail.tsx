import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { api, money } from '../api'
import { useApi } from '../hooks'
import { PdfPreview, type PreviewTarget } from '../PdfPreview'
import { Badge, Button, Card, ErrorNote, Input, Select, Skeleton } from '../ui'

interface Detail {
  flag: { id: string; type: string; severity: string; status: string; summary: string; exposureMinor: number; currency: string; resolution: string | null; assigneeId: string | null; evidence: any }
  invoice: { invoiceNumber: string; invoiceDate: string; totalMinor: number; status: string }
  vendor: { name: string }
  sources: { id: string; label: string; filename: string; page: number | null }[]
  events: { id: string; type: string; actor: string | null; data: any; createdAt: string }[]
  savings: { amountMinor: number; kind: string; feeMinor: number; reversed: boolean }[]
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex justify-between gap-4 py-2 text-sm"><span className="text-slate-500">{k}</span><span className="text-right font-medium">{v}</span></div>

export default function FlagDetail() {
  const { id } = useParams()
  const { data, error, reload } = useApi<Detail>(`/flags/${id}`)
  const users = useApi<{ id: string; name: string }[]>('/users')
  const [note, setNote] = useState('')
  const [credit, setCredit] = useState({ ref: '', amount: '' })
  const [err, setErr] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewTarget | null>(null)

  const act = async (body: object) => {
    try { await api(`/flags/${id}/actions`, { body }); setNote(''); setErr(null); reload() } catch (e) { setErr((e as Error).message) }
  }
  if (!data) return error ? <ErrorNote error={error} /> : <div className="space-y-6" aria-busy="true"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>
  const { flag, invoice, vendor, sources, events, savings } = data
  const ev = flag.evidence
  const closed = flag.status === 'resolved' || flag.status === 'dismissed'
  const cur = flag.currency

  return (
    <div className="space-y-6">
      <Link to="/flags" className="inline-flex h-8 items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft size={16} />Flags</Link>
      <div>
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold capitalize tracking-tight">{flag.type.replace(/_/g, ' ')}</h1><Badge value={flag.severity} /><Badge value={flag.status} /></div>
        <p className="mt-2 max-w-prose text-sm text-slate-600">{flag.summary}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card title="Evidence">
            <Row k="Vendor" v={vendor.name} />
            <Row k="Invoice" v={`${invoice.invoiceNumber} · ${invoice.invoiceDate} · ${money(invoice.totalMinor, cur)}`} />
            <Row k="Exposure" v={money(flag.exposureMinor, cur)} />
            {flag.type === 'rate_drift' && (<>
              <div className="my-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-md bg-red-50 p-4"><div className="text-xs text-red-700">Invoiced (line {ev.invoiceLine.lineNo}, page {ev.invoiceLine.page ?? '–'})</div><div className="text-lg font-semibold tabular-nums">{money(ev.invoiceLine.unitPriceMinor, cur)}</div><div className="text-xs text-slate-600">× {ev.invoiceLine.quantity} {ev.invoiceLine.unit}</div></div>
                <div className="rounded-md bg-emerald-50 p-4"><div className="text-xs text-emerald-700">Contract rate</div><div className="text-lg font-semibold tabular-nums">{money(ev.contractRate.unitPriceMinor, cur)}</div><div className="text-xs text-slate-600">valid {ev.contractRate.effectiveFrom} → {ev.contractRate.effectiveTo}</div></div>
              </div>
              {ev.clause && <blockquote className="rounded-md bg-slate-50 p-4 text-sm"><div className="mb-1 text-sm font-medium text-slate-700">Clause {ev.clause.ref}{ev.clause.page ? ` · page ${ev.clause.page}` : ''}</div><p className="whitespace-pre-wrap text-slate-700">{ev.clause.text}</p></blockquote>}
            </>)}
            {flag.type === 'duplicate_invoice' && (
              <div className="my-4 grid gap-4 text-sm sm:grid-cols-2">
                {[['This invoice', ev.duplicateInvoice], ['Original', ev.originalInvoice]].map(([label, i]: any) => (
                  <div key={label} className="rounded-md bg-slate-50 p-4"><div className="text-xs text-slate-500">{label}</div><div className="font-semibold">{i.number}</div><div className="text-slate-600">{i.date} · {money(i.totalMinor, cur)}</div></div>
                ))}
                <p className="text-xs sm:col-span-2 text-slate-500">Matched by rule: {ev.rule.replace(/_/g, ' ')}</p>
              </div>
            )}
          </Card>
          {sources.length > 0 && (
            <Card title="Source documents">
              <ul className="divide-y divide-slate-100">
                {sources.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <span className="min-w-0"><span className="block truncate font-medium">{d.label}</span><span className="block truncate text-xs text-slate-500">{d.filename}{d.page ? ` · page ${d.page}` : ''}</span></span>
                    <Button variant="ghost" onClick={() => setPreview({ id: d.id, title: d.label, page: d.page })}>{d.page ? `View page ${d.page}` : 'View'}</Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Activity">
            <ul className="space-y-4">
              {events.map((e) => (
                <li key={e.id} className="text-sm"><span className="font-medium capitalize">{e.type.replace(/_/g, ' ')}</span> <span className="text-slate-500">· {e.actor ?? 'system'} · {new Date(e.createdAt).toLocaleString()}</span>
                  {(e.data?.note || e.data?.creditNoteRef || e.data?.resolution) && <div className="text-slate-600">{[e.data.resolution?.replace(/_/g, ' '), e.data.creditNoteRef, e.data.note].filter(Boolean).join(' · ')}</div>}</li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Resolve">
            <ErrorNote error={err} />
            {savings.filter((s) => !s.reversed).map((s, i) => <p key={i} className="mb-4 rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">Verified {s.kind}: {money(s.amountMinor, cur)} · fee {money(s.feeMinor, cur)}</p>)}
            <div className="space-y-4">
              {!closed && (<>
                <Select aria-label="Assignee" value={flag.assigneeId ?? ''} onChange={(e) => act({ action: 'assign', assigneeId: e.target.value || null })}>
                  <option value="">Unassigned</option>{users.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
                <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={() => act({ action: 'dispute', note })}>Dispute with vendor</Button>
                  <Button variant="ghost" onClick={() => act({ action: 'dismiss', note })}>Dismiss</Button>
                </div>
                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <div className="text-sm font-medium text-slate-700">Credit note received</div>
                  <Input placeholder="Credit note ref" value={credit.ref} onChange={(e) => setCredit({ ...credit, ref: e.target.value })} />
                  <Input placeholder={`Amount (${cur})`} inputMode="decimal" value={credit.amount} onChange={(e) => setCredit({ ...credit, amount: e.target.value })} />
                  <Button variant="ghost" disabled={!credit.ref || !credit.amount} onClick={() => act({ action: 'credit_note_received', creditNoteRef: credit.ref, amountMinor: Math.round(Number(credit.amount) * 100) })}>Record credit note</Button>
                </div>
                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <div className="text-sm font-medium text-slate-700">Mark resolved (verifies savings)</div>
                  {[['price_corrected', 'Price corrected'], ['credit_note', 'Credit note applied'], ['invoice_rejected', 'Invoice rejected'], ['refund', 'Refund received']].map(([r, label]) => (
                    <Button key={r} className="mb-2 mr-2" onClick={() => act({ action: 'resolve', resolution: r, evidenceRef: credit.ref || undefined, note })}>{label}</Button>
                  ))}
                </div>
              </>)}
              {closed && <Button variant="ghost" onClick={() => act({ action: 'reopen' })}>Reopen</Button>}
            </div>
          </Card>
        </div>
      </div>
      {preview && <PdfPreview target={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}
