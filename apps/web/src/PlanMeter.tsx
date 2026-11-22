import { Link } from 'react-router-dom'
import { useApi } from './hooks'
import { Skeleton, cx } from './ui'

interface BillingLite {
  plan: { name: string; limits: { invoicesPerMonth: number | null } }
  usage: { invoicesThisMonth: number }
}

const nf = new Intl.NumberFormat('en-IN')

/** Records left on the plan this month. Turns amber at 80% and red when used up, with a prompt to upgrade. */
export function PlanMeter({ onNavigate }: { onNavigate: () => void }) {
  const { data } = useApi<BillingLite>('/billing')
  if (!data) return <Skeleton className="h-24" />

  const limit = data.plan.limits.invoicesPerMonth
  const used = data.usage.invoicesThisMonth
  const left = limit === null ? null : Math.max(0, limit - used)
  const ratio = limit === null || limit === 0 ? 0 : used / limit
  const state = limit === null ? 'unlimited' : used >= limit ? 'over' : ratio >= 0.8 ? 'near' : 'ok'

  const bar = { ok: 'bg-brand-500', near: 'bg-amber-500', over: 'bg-red-600', unlimited: 'bg-brand-500' }[state]
  const box = { ok: 'border-slate-200 bg-white', near: 'border-amber-200 bg-amber-50', over: 'border-red-200 bg-red-50', unlimited: 'border-slate-200 bg-white' }[state]
  const note = {
    ok: null,
    unlimited: null,
    near: `Only ${nf.format(left ?? 0)} left this month. Upgrade before you run out.`,
    over: 'Monthly records used up. Upgrade to keep checking invoices.',
  }[state]

  return (
    <div className={cx('space-y-2 rounded-lg border p-4', box)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">{data.plan.name} plan</span>
        <span className="text-xs text-slate-500">Records</span>
      </div>
      <div className="text-sm font-semibold tabular-nums text-slate-900">
        {left === null ? 'Unlimited' : `${nf.format(left)} left`}
        {limit !== null && <span className="font-normal text-slate-500"> of {nf.format(limit)}</span>}
      </div>
      {limit !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Records used this month" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)}>
          <div className={cx('h-full rounded-full transition-all duration-200', bar)} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        </div>
      )}
      {note && <p role="status" className={cx('text-xs', state === 'over' ? 'text-red-700' : 'text-amber-900')}>{note}</p>}
      {(state === 'near' || state === 'over') && (
        <Link to="/billing#pricing" onClick={onNavigate} className="inline-flex h-8 w-full items-center justify-center rounded-md bg-brand-600 text-sm font-medium text-white transition-colors duration-150 hover:bg-brand-700">Buy more records</Link>
      )}
    </div>
  )
}
