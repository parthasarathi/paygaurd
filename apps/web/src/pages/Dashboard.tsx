import { useState } from 'react'
import { Link } from 'react-router-dom'
import { money } from '../api'
import { useApi } from '../hooks'
import { AlertTriangle } from 'lucide-react'
import { Badge, Card, ErrorNote, PageHeader, Skeleton } from '../ui'

interface Alert { id: string; level: 'critical' | 'warning'; title: string; detail: string; exposureMinor: number; currency: string; flagId?: string }
interface D {
  alerts: Alert[]
  openFlags: number; openExposureMinor: number; invoices: number; avoidedMinor: number; recoveredMinor: number; feeMinor: number
  byType: { type: string; n: number; exposure: string }[]
  byVendor: { vendor: string; n: number; exposure: string; currency: string }[]
  pipeline: { status: string; n: number; exposure: string }[]
  topFlags: { id: string; type: string; severity: string; status: string; summary: string; exposureMinor: number; currency: string; invoiceNumber: string; vendorName: string }[]
  recent: { id: string; type: string; createdAt: string; actor: string | null; flagId: string; flagType: string; invoiceNumber: string }[]
}

const label = (s: string) => s.replace(/_/g, ' ')

const Stat = ({ title, value, hint, tone }: { title: string; value: string; hint?: string; tone?: string }) => (
  <div className="min-w-0">
    <dt className="text-xs text-slate-500">{title}</dt>
    <dd className={`mt-1 text-lg font-semibold tabular-nums ${tone ?? ''}`}>{value}</dd>
    {hint && <dd className="mt-1 text-xs text-slate-500">{hint}</dd>}
  </div>
)

function Attention({ alerts }: { alerts: Alert[] }) {
  const [all, setAll] = useState(false)
  if (alerts.length === 0) return null
  const shown = all ? alerts : alerts.slice(0, 3)
  const critical = alerts.filter((a) => a.level === 'critical').length
  return (
    <section className="rounded-lg border border-red-200 bg-white shadow-card" aria-label="Needs attention">
      <header className="flex items-center justify-between h-12 rounded-t-lg border-b border-red-100 bg-red-50 px-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-red-800"><AlertTriangle size={20} />Needs attention · {critical} critical, {alerts.length - critical} warning</h2>
        {alerts.length > 3 && <button className="text-sm text-red-700 underline" onClick={() => setAll(!all)}>{all ? 'Show less' : `Show all ${alerts.length}`}</button>}
      </header>
      <ul className="divide-y divide-slate-100">
        {shown.map((a) => {
          const row = (
            <div className="flex items-center gap-4 px-6 py-4">
              <span className={`h-2 w-2 shrink-0 rounded-full ${a.level === 'critical' ? 'bg-red-500' : 'bg-amber-400'}`} />
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{a.title}</div><div className="truncate text-xs text-slate-500">{a.detail}</div></div>
              <div className="shrink-0 text-sm font-semibold tabular-nums">{money(a.exposureMinor, a.currency)}</div>
            </div>
          )
          return <li key={a.id}>{a.flagId ? <Link to={`/flags/${a.flagId}`} className="block transition-colors duration-150 hover:bg-slate-50">{row}</Link> : row}</li>
        })}
      </ul>
    </section>
  )
}

const STAGES = [
  ['open', 'To review'], ['assigned', 'Assigned'], ['disputed', 'Disputed'], ['credit_pending', 'Credit pending'], ['resolved', 'Resolved'],
] as const

export default function Dashboard() {
  const { data, error } = useApi<D>('/dashboard')
  if (!data) return error ? <ErrorNote error={error} /> : (
    <div className="space-y-6" aria-busy="true"><Skeleton className="h-8 w-48" /><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>
  )
  const verified = data.avoidedMinor + data.recoveredMinor
  const stage = (s: string) => data.pipeline.find((p) => p.status === s)
  const maxVendor = Math.max(1, ...data.byVendor.map((v) => Number(v.exposure)))

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description="What is at risk, what is verified, and where each flag stands." />

      <Card><dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title="At risk now" value={money(data.openExposureMinor)} hint={`${data.openFlags} open flag${data.openFlags === 1 ? '' : 's'} to resolve`} tone={data.openFlags ? 'text-red-600' : undefined} />
        <Stat title="Savings verified" value={money(verified)} hint={`${money(data.avoidedMinor)} avoided · ${money(data.recoveredMinor)} recovered`} tone={verified ? 'text-emerald-600' : undefined} />
        <Stat title="Success fee owed" value={money(data.feeMinor)} hint="Share of verified savings" />
        <Stat title="Invoices checked" value={String(data.invoices)} />
      </dl></Card>

      <Attention alerts={data.alerts} />

      {data.invoices === 0 && (
        <Card><p className="text-sm text-slate-600">Nothing checked yet. <Link to="/documents" className="text-brand-700 underline underline-offset-2 hover:text-brand-600">Upload a contract and an invoice</Link>, or connect email, a folder or the API under <Link to="/integrations" className="text-brand-700 underline underline-offset-2 hover:text-brand-600">Integrations</Link>.</p></Card>
      )}

      <Card title="Resolution pipeline">
        <ol className="grid grid-cols-1 gap-4 sm:grid-cols-5">
          {STAGES.map(([key, name]) => {
            const p = stage(key)
            return (
              <li key={key} className="rounded-md bg-slate-50 p-4 text-center">
                <div className="text-lg font-semibold tabular-nums">{p?.n ?? 0}</div>
                <div className="text-xs text-slate-500">{name}</div>
                <div className="mt-1 text-xs font-medium text-slate-700">{money(Number(p?.exposure ?? 0))}</div>
              </li>
            )
          })}
        </ol>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          <Card title="Biggest open flags" action={<Link to="/flags" className="text-sm text-brand-700 underline underline-offset-2 hover:text-brand-600">View all</Link>}>
            {data.topFlags.length === 0 ? <p className="text-sm text-slate-500">No open flags.</p> : (
              <ul className="divide-y divide-slate-100">
                {data.topFlags.map((f) => (
                  <li key={f.id}>
                    <Link to={`/flags/${f.id}`} className="flex items-start gap-4 px-2 py-4 -mx-2 rounded-md transition-colors duration-150 hover:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-medium"><span className="capitalize">{label(f.type)}</span><Badge value={f.severity} /><Badge value={f.status} /></div>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">{f.summary}</p>
                        <p className="text-xs text-slate-500">{f.vendorName} · {f.invoiceNumber}</p>
                      </div>
                      <div className="shrink-0 text-sm font-semibold tabular-nums">{money(f.exposureMinor, f.currency)}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card title="Exposure by vendor">
            {data.byVendor.length === 0 ? <p className="text-sm text-slate-500">No open exposure.</p> : (
              <ul className="space-y-4">
                {data.byVendor.map((v) => (
                  <li key={v.vendor} className="text-sm">
                    <div className="flex justify-between gap-2"><span className="truncate">{v.vendor}</span><span className="shrink-0 font-medium">{money(Number(v.exposure), v.currency)}</span></div>
                    <div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-red-400" style={{ width: `${(Number(v.exposure) / maxVendor) * 100}%` }} /></div>
                    <div className="mt-1 text-xs text-slate-500">{v.n} flag{v.n === 1 ? '' : 's'}</div>
                  </li>
                ))}
              </ul>
            )}
            {data.byType.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-4 text-sm text-slate-600">
                {data.byType.map((t) => <div key={t.type} className="flex justify-between py-1"><span className="capitalize">{label(t.type)}</span><span>{t.n} · {money(Number(t.exposure))}</span></div>)}
              </div>
            )}
          </Card>

          <Card title="Recent activity">
            {data.recent.length === 0 ? <p className="text-sm text-slate-500">No activity yet.</p> : (
              <ul className="space-y-4">
                {data.recent.map((e) => (
                  <li key={e.id} className="text-sm">
                    <Link to={`/flags/${e.flagId}`} className="hover:underline"><span className="font-medium capitalize">{label(e.type)}</span> · {e.invoiceNumber}</Link>
                    <div className="text-xs text-slate-500">{label(e.flagType)} · {e.actor ?? 'system'} · {new Date(e.createdAt).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
