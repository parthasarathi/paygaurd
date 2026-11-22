import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { money } from '../api'
import { useApi } from '../hooks'
import { Badge, Empty, ErrorNote, PageHeader, Select, Skeleton } from '../ui'

interface F { id: string; type: string; severity: string; status: string; summary: string; exposureMinor: number; currency: string; invoiceNumber: string; vendorName: string }

export default function Flags() {
  const [filter, setFilter] = useState('open')
  const { data, error } = useApi<F[]>(`/flags?status=${filter}`)
  return (
    <div className="space-y-6">
      <PageHeader title="Flags" description="Possible overbilling found by checking invoices against contracts and earlier invoices." action={
        <Select aria-label="Status" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-48 capitalize">
          {['open', 'assigned', 'disputed', 'credit_pending', 'resolved', 'dismissed'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </Select>
      } />
      <ErrorNote error={error} />
      <section className="rounded-lg border border-slate-200 bg-white shadow-card">
        {!data && !error && <div className="space-y-4 p-6" aria-busy="true"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>}
        {data && data.length === 0 && <Empty>No flags here.</Empty>}
        {data && data.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {data.map((f) => (
              <li key={f.id}>
                <Link to={`/flags/${f.id}`} className="flex h-auto items-center gap-4 px-6 py-4 transition-colors duration-150 hover:bg-slate-50 focus-visible:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium"><span className="capitalize">{f.type.replace(/_/g, ' ')}</span><Badge value={f.severity} /><Badge value={f.status} /></div>
                    <p className="mt-2 text-sm text-slate-700">{f.summary}</p>
                    <p className="mt-1 text-xs text-slate-500">{f.vendorName} · {f.invoiceNumber}</p>
                  </div>
                  <div className="text-right text-sm font-semibold tabular-nums">{money(f.exposureMinor, f.currency)}</div>
                  <ChevronRight size={20} className="shrink-0 text-slate-400" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
