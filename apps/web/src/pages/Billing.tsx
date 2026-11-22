import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { api, money } from '../api'
import { useApi } from '../hooks'
import { Badge, Button, Card, Empty, ErrorNote, Input, Notice, PageHeader, Skeleton, cx } from '../ui'

interface Totals { verifiedMinor: number; avoidedMinor: number; recoveredMinor: number; feeMinor: number; count: number }
interface Limits { invoicesPerMonth: number; users: number | null; outgoingEndpoints: number; inboundValidationApi: boolean; externalAgents: boolean }
interface Usage { invoicesThisMonth: number; users: number; outgoingEndpoints: number; apiKeys: number }
interface Tier { id: string; name: string; feeShareBps: number; upToMonthlyMinor: number | null; recommended: boolean; limits: Limits; features: { text: string; comingSoon?: boolean }[] }
interface Billing {
  plan: { name: string; feeShareBps: number; minimumMonthlyMinor: number; currency: string; limits: Limits }
  usage: Usage
  thisMonth: Totals
  allTime: Totals
  invoices: { month: string; verifiedMinor: number; feeMinor: number; status: string }[]
  ledger: { savingId: string; flagId: string; invoiceNumber: string; vendorName: string; kind: string; amountMinor: number; feeMinor: number; evidenceRef: string | null; verifiedAt: string }[]
  tiers: Tier[]
}

type UsageState = 'ok' | 'near' | 'over' | 'unlimited'
function usageStatus(used: number, limit: number | null): { ratio: number; state: UsageState } {
  if (limit === null) return { ratio: 0, state: 'unlimited' }
  if (limit <= 0) return { ratio: used > 0 ? 1 : 0, state: used > 0 ? 'over' : 'ok' }
  const ratio = used / limit
  return { ratio, state: ratio > 1 ? 'over' : ratio >= 0.8 ? 'near' : 'ok' }
}
const count = (n: number) => n.toLocaleString('en-IN')
const endpoints = (n: number) => (n === 0 ? 'None' : `${count(n)} ${n === 1 ? 'endpoint' : 'endpoints'}`)
const fill: Record<UsageState, string> = { ok: 'bg-brand-500', near: 'bg-amber-500', over: 'bg-red-600', unlimited: '' }

function UsageRow({ label, used, limit, unit }: { label: string; used: number; limit: number | null; unit: string }) {
  const { ratio, state } = usageStatus(used, limit)
  return (
    <div className="py-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <span className="text-sm text-slate-600">{label}</span>
        <span className={cx('text-sm font-medium tabular-nums', state === 'over' ? 'text-red-700' : 'text-slate-900')}>
          {limit === null ? `${count(used)} used, unlimited` : `${count(used)} of ${count(limit)} ${unit}`}
        </span>
      </div>
      {state !== 'unlimited' && (
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(ratio, 1) * 100)}>
          <div className={cx('h-2 rounded-full', fill[state])} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
        </div>
      )}
    </div>
  )
}

const pct = (bps: number) => `${bps / 100}%`
const num = 'tabular-nums text-right'
const th = 'h-10 px-4 text-xs font-medium text-slate-600'
const td = 'h-12 px-4'
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="text-base font-semibold tabular-nums text-slate-900">{children}</dd>
    </div>
  )
}

const faqs = [
  { q: 'What counts as a verified saving?', a: 'Money you did not pay because of a confirmed flag (a corrected price, a credit note or a rejected invoice, counted as avoided) or money you got back (a refund, counted as recovered). It is verified when you mark the flag resolved.' },
  { q: 'What if the vendor never credits us?', a: 'Then no fee is due. The fee only applies once you mark the flag resolved, and avoided savings are verified at resolution.' },
  { q: 'Can fees be reversed?', a: 'Yes. Reopening a flag reverses its fee, and dismissed flags never count.' },
  { q: 'Do you charge for AI usage?', a: 'No. Checks are deterministic rules, and the in-app agent answers locally. Reading documents uses your own Anthropic key, and repeat files are cached so they cost nothing.' },
  { q: 'Why not charge per invoice or per seat?', a: 'Invoice volume sets the plan because it tracks the work we do. Seats are a limit, not the price, so adding an approver never costs extra per head. The share keeps our incentives aligned with yours: we earn when you save.' },
  { q: 'Is this the final pricing?', a: 'No. This is a demo pricing view.' },
]

function HowPricingWorks({ plan }: { plan: Billing['plan'] }) {
  const cur = plan.currency
  const unit = 5000000, billed = 5200000, qty = 10
  const saving = (billed - unit) * qty
  const fee = Math.round((saving * plan.feeShareBps) / 10000)
  const rows: [string, string, boolean?][] = [
    [`Contract rate, ${qty} laptops`, money(unit, cur)],
    ['Supplier billed per laptop', money(billed, cur)],
    ['Flag value (difference × 10)', money(saving, cur)],
    ['Verified saving (credit note issued)', money(saving, cur)],
    [`Our fee at ${plan.name} ${pct(plan.feeShareBps)}`, money(fee, cur)],
    ['You keep', money(saving - fee, cur), true],
  ]
  return (
    <Card title="How pricing works">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-4 text-sm text-slate-700">
          <ol className="list-decimal space-y-3 pl-6 marker:font-medium marker:text-slate-500">
            <li>You pay nothing to connect your systems or to run checks.</li>
            <li>We only charge when a flag is confirmed and marked resolved. The amount we count is money you did not pay (price corrected, credit note or invoice rejected, called <strong>avoided</strong>) or got back (a refund, called <strong>recovered</strong>).</li>
            <li>The fee is your plan's percentage of that verified amount, locked at the rate on the day it was verified.</li>
            <li>Dismissed flags and reopened flags never count. Reopening a flag reverses its fee.</li>
            <li>Plans differ by what you can run: invoices per month, users, and how many outgoing webhooks or external agents you can connect. The price is always a share of verified savings.</li>
          </ol>
        </div>
        <div>
          <p className="text-sm text-slate-700">A supplier bills {money(billed, cur)} per laptop against a {money(unit, cur)} contract rate, on {qty} laptops. We flag it, you dispute it, and the supplier issues a credit note.</p>
          <table className="mt-4 w-full text-sm">
            <caption className="sr-only">Worked example at your plan's rate</caption>
            <tbody className="divide-y divide-slate-100">
              {rows.map(([l, v, strong]) => (
                <tr key={l} className="border-t border-slate-100 first:border-t-0">
                  <th scope="row" className={cx('h-10 pr-4 text-left font-normal text-slate-600', strong && 'font-semibold text-slate-900')}>{l}</th>
                  <td className={cx('h-10 whitespace-nowrap tabular-nums text-right', strong && 'font-semibold text-slate-900')}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-6 divide-y divide-slate-100 border-t border-slate-100">
        {faqs.map((f) => (
          <details key={f.q} className="group py-3">
            <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
              {f.q}<ChevronDown size={16} className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <p className="mt-2 max-w-prose text-sm text-slate-600">{f.a}</p>
          </details>
        ))}
      </div>
    </Card>
  )
}

export default function Billing() {
  const { data, error } = useApi<Billing>('/billing')
  const [input, setInput] = useState('500000')
  const [est, setEst] = useState<{ feeMinor: number; netMinor: number } | null>(null)
  const [estError, setEstError] = useState<string | null>(null)

  const rupees = Number(input.replace(/,/g, ''))
  const valid = input.trim() !== '' && Number.isFinite(rupees) && rupees >= 0
  const savingsMinor = valid ? Math.round(rupees * 100) : 0

  useEffect(() => {
    if (!valid) { setEst(null); return }
    const t = setTimeout(() => {
      api<{ feeMinor: number; netMinor: number }>(`/billing/estimate?savings=${savingsMinor}`)
        .then((r) => { setEst(r); setEstError(null) })
        .catch((e) => setEstError(e.message))
    }, 300)
    return () => clearTimeout(t)
  }, [savingsMinor, valid])

  const header = <PageHeader title="Billing & pricing" description="You pay a share of the savings we verify. No subscription and no minimum." action={<Badge value="medium">Demo pricing</Badge>} />

  if (!data) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorNote error={error} />
        {!error && <><Skeleton className="h-40" /><Skeleton className="h-48" /></>}
      </div>
    )
  }

  const { plan, thisMonth, tiers, usage } = data
  const cur = plan.currency

  return (
    <div className="space-y-8">
      {header}
      <HowPricingWorks plan={plan} />

      <Notice tone="warning">Pricing shown here is illustrative. No payments are processed and no invoices are sent.</Notice>

      <Card title="This month">
        <dl className="divide-y divide-slate-100">
          <Row label="Verified savings">{money(thisMonth.verifiedMinor, cur)}</Row>
          <Row label="Fee due">{money(thisMonth.feeMinor, cur)}</Row>
          <Row label="Plan">{plan.name} at {pct(plan.feeShareBps)} of verified savings</Row>
        </dl>
        <p className="mt-2 text-sm text-slate-600">
          {thisMonth.count === 0
            ? 'Nothing verified yet this month, so nothing is due.'
            : `${money(thisMonth.avoidedMinor, cur)} caught before payment and ${money(thisMonth.recoveredMinor, cur)} recovered across ${thisMonth.count} ${thisMonth.count === 1 ? 'saving' : 'savings'}.`}
        </p>
      </Card>

      <Card title="Plan usage this month">
        <div className="divide-y divide-slate-100">
          <UsageRow label="Invoices checked" used={usage.invoicesThisMonth} limit={plan.limits.invoicesPerMonth} unit="invoices" />
          <UsageRow label="Users" used={usage.users} limit={plan.limits.users} unit="users" />
          <UsageRow label="Outgoing webhooks and external agents" used={usage.outgoingEndpoints} limit={plan.limits.outgoingEndpoints} unit="endpoints" />
        </div>
        <p className="mt-2 text-sm text-slate-600">Limits are shown for planning and are not enforced in this demo.</p>
      </Card>

      <section className="space-y-4" aria-labelledby="pricing">
        <h2 id="pricing" className="text-lg font-semibold">Pricing</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {tiers.map((t) => {
            const mine = t.feeShareBps === plan.feeShareBps
            return (
              <div key={t.id} className={cx('flex flex-col rounded-lg border bg-white p-6 shadow-card', t.recommended ? 'border-2 border-brand-500' : 'border-slate-200')}>
                <div className="flex h-8 items-center justify-between gap-2">
                  <h3 className="text-base font-semibold">{t.name}</h3>
                  <div className="flex gap-2">
                    {t.recommended && <Badge value="open">Recommended</Badge>}
                    {mine && <Badge value="resolved">Your plan</Badge>}
                  </div>
                </div>
                <p className="mt-6 text-xl font-semibold tabular-nums text-slate-900"><span className="text-xl">{pct(t.feeShareBps)}</span> <span className="text-sm font-normal text-slate-600">of verified savings</span></p>
                <dl className="mt-6 divide-y divide-slate-100 border-y border-slate-100 text-sm">
                  {([
                    ['Invoices checked per month', count(t.limits.invoicesPerMonth)],
                    ['Users', t.limits.users === null ? 'Unlimited' : count(t.limits.users)],
                    ['Outgoing webhooks and external agents', endpoints(t.limits.outgoingEndpoints)],
                  ] as const).map(([l, v]) => (
                    <div key={l} className="flex items-start justify-between gap-4 py-3">
                      <dt className="text-slate-600">{l}</dt>
                      <dd className="shrink-0 font-medium tabular-nums text-slate-900">{v}</dd>
                    </div>
                  ))}
                </dl>
                <ul className="mt-6 flex-1 space-y-2">
                  {t.features.map((f) => (
                    <li key={f.text} className="flex items-start gap-2 text-sm text-slate-700">
                      <Check size={16} className="mt-1 shrink-0 text-brand-600" aria-hidden />
                      <span>{f.text}{f.comingSoon && <span className="text-slate-500"> (coming soon)</span>}</span>
                    </li>
                  ))}
                </ul>
                <Button variant="ghost" disabled className="mt-6 w-full">{mine ? 'Current plan' : 'Contact sales'}</Button>
              </div>
            )
          })}
        </div>
      </section>

      <Card title="Savings calculator">
        <div className="grid gap-6 md:grid-cols-[minmax(0,320px)_1fr]">
          <div>
            <label htmlFor="calc" className="text-sm font-medium text-slate-900">Monthly overcharges caught (₹)</label>
            <Input id="calc" inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value)} className="mt-2" aria-invalid={!valid} />
            <p className="mt-2 text-sm text-slate-600">
              {valid && est ? `At this volume the matching plan's fee is ${money(est.feeMinor, cur)}; you keep ${money(est.netMinor, cur)}.` : 'Enter an amount to see what you would keep.'}
            </p>
            <div className="mt-2"><ErrorNote error={estError} /></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-sm">
              <thead><tr className="border-b border-slate-200 text-left"><th className={th}>Plan</th><th className={cx(th, 'text-right')}>Fee</th><th className={cx(th, 'text-right')}>You keep</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {tiers.map((t) => {
                  const fee = Math.round((savingsMinor * t.feeShareBps) / 10000)
                  return (
                    <tr key={t.id}>
                      <td className={td}>{t.name} <span className="text-slate-500">{pct(t.feeShareBps)}</span></td>
                      <td className={cx(td, num)}>{money(fee, cur)}</td>
                      <td className={cx(td, num, 'font-medium')}>{money(savingsMinor - fee, cur)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <Card title="Monthly statements">
        {data.invoices.length === 0 ? <Empty>Statements appear here after your first verified saving.</Empty> : (
          <div className="-mx-6 -my-6 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead><tr className="border-b border-slate-200 text-left"><th className={th}>Month</th><th className={cx(th, 'text-right')}>Verified</th><th className={cx(th, 'text-right')}>Fee</th><th className={th}>Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.invoices.map((i) => (
                  <tr key={i.month}>
                    <td className={td}>{monthLabel(i.month)}</td>
                    <td className={cx(td, num)}>{money(i.verifiedMinor, cur)}</td>
                    <td className={cx(td, num)}>{money(i.feeMinor, cur)}</td>
                    <td className={td}><Badge value={i.status === 'due' ? 'medium' : 'low'}>{i.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Fee ledger">
        {data.ledger.length === 0 ? <Empty>Fees appear here when you mark a flag resolved.</Empty> : (
          <div className="-mx-6 -my-6 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-slate-200 text-left"><th className={th}>Verified</th><th className={th}>Invoice</th><th className={th}>Vendor</th><th className={th}>Kind</th><th className={cx(th, 'text-right')}>Amount</th><th className={cx(th, 'text-right')}>Fee</th><th className={th}>Evidence</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.ledger.map((l) => (
                  <tr key={l.savingId}>
                    <td className={cx(td, 'whitespace-nowrap text-slate-600')}>{dateLabel(l.verifiedAt)}</td>
                    <td className={td}>{l.invoiceNumber}</td>
                    <td className={td}>{l.vendorName}</td>
                    <td className={td}><Badge value={l.kind === 'avoided' ? 'open' : 'resolved'}>{l.kind}</Badge></td>
                    <td className={cx(td, num)}>{money(l.amountMinor, cur)}</td>
                    <td className={cx(td, num)}>{money(l.feeMinor, cur)}</td>
                    <td className={cx(td, 'text-slate-600')}>{l.evidenceRef ?? 'None'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
