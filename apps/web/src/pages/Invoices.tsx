import { AlertOctagon, FileCheck, FileWarning, FileX } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, money } from '../api'
import { useApi } from '../hooks'
import { PdfPreview, type PreviewTarget } from '../PdfPreview'
import { Badge, Button, Card, Empty, ErrorNote, Input, Modal, Notice, PageHeader, Skeleton } from '../ui'

interface Problem { id: string; type: string; severity: string; summary: string; exposureMinor: number }
interface Inv {
  id: string; documentId: string | null; invoiceNumber: string; invoiceDate: string; dueDate: string | null; totalMinor: number; currency: string; status: string
  vendorName: string; openFlags: number; poNumber: string | null; contractNumber: string | null
  contractDocumentId: string | null; poDocumentId: string | null; hasContract: boolean; hasPo: boolean; missingDocs: string[]
  problems: Problem[]; canPay: boolean; payableMinor: number; deductionMinor: number; reasons: string[]; warnings: string[]
}
interface Con { documentId: string | null; id: string; contractNumber: string; title: string; vendorName: string; effectiveFrom: string; effectiveTo: string; rateCount: number }

const label = (s: string) => s.replace(/_/g, ' ')
const SEV = { high: 'border-red-300 bg-red-50 text-red-800', medium: 'border-amber-300 bg-amber-50 text-amber-800', low: 'border-slate-200 bg-slate-50 text-slate-700' } as Record<string, string>

function DocChip({ name, docId, missing, onOpen }: { name: string; docId: string | null; missing: boolean; onOpen: () => void }) {
  if (missing) return <span className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 text-xs font-medium text-red-700"><FileX size={16} />{name} missing</span>
  return (
    <button onClick={onOpen} disabled={!docId} className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs font-medium text-emerald-700 transition-colors duration-150 hover:bg-emerald-100 disabled:cursor-default">
      <FileCheck size={16} />{name}
    </button>
  )
}

export default function Invoices() {
  const inv = useApi<Inv[]>('/invoices')
  const con = useApi<Con[]>('/contracts')
  const [paying, setPaying] = useState<Inv | null>(null)
  const [payRef, setPayRef] = useState('')
  const [payErr, setPayErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewTarget | null>(null)
  const [onlyIssues, setOnlyIssues] = useState(false)
  const open = (id: string | null, title: string, page?: number | null) => id && setPreview({ id, title, page })

  const confirmPay = async () => {
    if (!paying) return
    try {
      await api(`/invoices/${paying.id}/pay`, { body: { reference: payRef || undefined } })
      setNotice(`Payment of ${money(paying.payableMinor, paying.currency)} recorded for ${paying.invoiceNumber}.`)
      setPaying(null); setPayRef(''); setPayErr(null); inv.reload()
    } catch (e) { setPayErr((e as Error).message); inv.reload() }
  }

  const list = (inv.data ?? []).filter((i) => !onlyIssues || i.problems.length > 0 || i.missingDocs.length > 0)
  const withIssues = (inv.data ?? []).filter((i) => i.problems.length > 0 || i.missingDocs.length > 0).length

  return (
    <div className="space-y-6">
      <PageHeader title="Invoices & contracts" description="Each invoice with its supporting files, problems found and whether it is safe to pay." action={
        inv.data && inv.data.length > 0 ? (
          <label className="flex h-10 items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />Only with issues ({withIssues})</label>
        ) : undefined
      } />
      {notice && <Notice tone="success">{notice}</Notice>}
      <ErrorNote error={inv.error} />

      <div className="space-y-6">
        {!inv.data && !inv.error && <><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></>}
        {inv.data && list.length === 0 && <Card><Empty>{onlyIssues ? 'No invoices with issues.' : 'No invoices yet.'}</Empty></Card>}
        {list.map((i) => {
          const bad = i.problems.length > 0
          const total = i.problems.reduce((n, p) => n + p.exposureMinor, 0)
          return (
            <article key={i.id} className={`overflow-hidden rounded-lg border bg-white shadow-card ${bad ? 'border-red-300' : i.missingDocs.length ? 'border-amber-300' : 'border-slate-200'}`}>
              {bad && (
                <div className="border-b border-red-200 bg-red-50 p-6">
                  <div className="flex items-center justify-between gap-3 text-sm font-semibold text-red-800">
                    <span className="flex items-center gap-2"><AlertOctagon size={20} />{i.problems.length} problem{i.problems.length === 1 ? '' : 's'} found — possible overcharge of {money(total, i.currency)}</span>
                  </div>
                  <ul className="mt-4 space-y-2">
                    {i.problems.map((p) => (
                      <li key={p.id}>
                        <Link to={`/flags/${p.id}`} className={`flex items-start justify-between gap-3 rounded-md border px-4 py-2 text-sm transition-opacity duration-150 hover:opacity-80 ${SEV[p.severity] ?? SEV.low}`}>
                          <span><span className="font-semibold capitalize">{label(p.type)}</span> · {p.summary}</span>
                          <span className="shrink-0 font-semibold tabular-nums">{money(p.exposureMinor, i.currency)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="space-y-4 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2"><span className="text-base font-semibold">{i.invoiceNumber}</span><Badge value={i.status} /></div>
                    <div className="mt-1 text-sm text-slate-600">{i.vendorName} · {i.invoiceDate}{i.dueDate ? ` · due ${i.dueDate}` : ''}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold tabular-nums">{money(i.totalMinor, i.currency)}</div>
                    {i.deductionMinor > 0 && <div className="mt-1 text-xs text-emerald-700 tabular-nums">pay {money(i.payableMinor, i.currency)} after savings</div>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">Files</span>
                  <DocChip name="Invoice" docId={i.documentId} missing={!i.documentId} onOpen={() => open(i.documentId, `Invoice ${i.invoiceNumber}`)} />
                  <DocChip name={i.contractNumber ? `Contract ${i.contractNumber}` : 'Contract'} docId={i.contractDocumentId} missing={!i.hasContract} onOpen={() => open(i.contractDocumentId, `Contract ${i.contractNumber ?? ''}`)} />
                  <DocChip name={i.poNumber ? `PO ${i.poNumber}` : 'PO'} docId={i.poDocumentId} missing={!i.hasPo} onOpen={() => open(i.poDocumentId, `PO ${i.poNumber ?? ''}`)} />
                </div>
                {i.missingDocs.length > 0 && (
                  <p className="flex flex-wrap items-center gap-1 text-xs text-amber-800"><FileWarning size={16} />Can't be fully verified. Missing: {i.missingDocs.join(', ')}. <Link to="/documents" className="underline">Upload</Link></p>
                )}

                <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
                  <span className="text-xs text-slate-600">{i.status === 'paid' ? 'Paid' : i.canPay ? 'Ready to pay' : `Blocked: ${i.reasons[0]}`}</span>
                  {i.status !== 'paid' && i.canPay && <Button onClick={() => { setPaying(i); setPayErr(null) }}>Pay {money(i.payableMinor, i.currency)}</Button>}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <Card title="Contracts">
        <ErrorNote error={con.error} />
        {!con.data && !con.error && <Skeleton className="h-24 w-full" />}
        {con.data && con.data.length === 0 ? <Empty>No contracts yet.</Empty> : con.data && (
          <div className="-mx-6 -my-6 overflow-x-auto">
          <table className="w-full text-sm"><thead className="h-12 text-left text-xs text-slate-600"><tr><th className="px-6 font-medium">Contract</th><th className="font-medium">Vendor</th><th className="font-medium">Valid</th><th className="text-right font-medium">Rates</th><th className="px-6 text-right font-medium">File</th></tr></thead>
            <tbody className="divide-y divide-slate-100 border-t border-slate-100">{con.data.map((c) => (
              <tr key={c.id} className="h-12"><td className="px-6 font-medium">{c.contractNumber}</td><td>{c.vendorName}</td><td className="whitespace-nowrap">{c.effectiveFrom} → {c.effectiveTo}</td><td className="text-right tabular-nums">{c.rateCount}</td>
                <td className="px-6 text-right">{c.documentId ? <Button size="sm" variant="ghost" onClick={() => open(c.documentId, `Contract ${c.contractNumber}`)}>View</Button> : <span className="text-slate-500">–</span>}</td></tr>
            ))}</tbody></table>
          </div>
        )}
      </Card>

      {paying && (
        <Modal title={`Pay invoice ${paying.invoiceNumber}`} onClose={() => setPaying(null)}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-4"><span className="text-slate-600">Vendor</span><span>{paying.vendorName}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-600">Invoice total</span><span className="tabular-nums">{money(paying.totalMinor, paying.currency)}</span></div>
            {paying.deductionMinor > 0 && <div className="flex justify-between gap-4 text-emerald-700"><span>Verified savings deducted</span><span className="tabular-nums">− {money(paying.deductionMinor, paying.currency)}</span></div>}
            <div className="flex justify-between gap-4 border-t border-slate-100 pt-2 font-semibold"><span>Amount to pay</span><span className="tabular-nums">{money(paying.payableMinor, paying.currency)}</span></div>
          </div>
          {paying.warnings.map((w) => <Notice key={w} tone="warning">{w}</Notice>)}
          <Input placeholder="Payment reference (optional)" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
          <p className="text-xs text-slate-600">This records the payment in the ledger. It does not move money from your bank.</p>
          <ErrorNote error={payErr} />
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setPaying(null)}>Cancel</Button><Button onClick={confirmPay}>Confirm payment</Button></div>
        </Modal>
      )}
      {preview && <PdfPreview target={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}
