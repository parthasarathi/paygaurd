import { X } from 'lucide-react'
import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export const PageHeader = ({ title, description, action }: { title: string; description?: string; action?: ReactNode }) => (
  <header className="flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-1 max-w-prose text-sm text-slate-600">{description}</p>}
    </div>
    {action}
  </header>
)

export const Card = ({ title, children, action, className }: { title?: string; children: ReactNode; action?: ReactNode; className?: string }) => (
  <section className={cx('rounded-lg border border-slate-200 bg-white shadow-card', className)}>
    {title && (
      <header className="flex h-12 items-center justify-between gap-4 border-b border-slate-100 px-6">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {action}
      </header>
    )}
    <div className="p-6">{children}</div>
  </section>
)

const tones: Record<string, string> = {
  high: 'bg-red-50 text-red-700 ring-red-200', medium: 'bg-amber-50 text-amber-800 ring-amber-200', low: 'bg-slate-100 text-slate-700 ring-slate-200',
  open: 'bg-brand-50 text-brand-700 ring-brand-100', assigned: 'bg-indigo-50 text-indigo-700 ring-indigo-200', disputed: 'bg-orange-50 text-orange-800 ring-orange-200',
  credit_pending: 'bg-violet-50 text-violet-700 ring-violet-200', resolved: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dismissed: 'bg-slate-100 text-slate-600 ring-slate-200',
  on_hold: 'bg-amber-50 text-amber-800 ring-amber-200', rejected: 'bg-red-50 text-red-700 ring-red-200', received: 'bg-slate-100 text-slate-700 ring-slate-200',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}
export const Badge = ({ value, children }: { value: string; children?: ReactNode }) => (
  <span className={cx('inline-flex h-6 items-center rounded-full px-2 text-xs font-medium capitalize ring-1 ring-inset', tones[value] ?? tones.low)}>{children ?? value.replace(/_/g, ' ')}</span>
)

type Variant = 'primary' | 'ghost' | 'danger'
export const Button = ({ variant = 'primary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) => (
  <button
    {...p}
    className={cx(
      'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
      size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm',
      variant === 'primary' && 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-700',
      variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
      variant === 'ghost' && 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100',
      className,
    )}
  />
)

const field = 'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 transition-colors hover:border-slate-400 focus:border-brand-500 disabled:bg-slate-50'
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(field, className)} />
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(field, 'pr-8', className)} />

export const Empty = ({ children }: { children: ReactNode }) => <p className="py-8 text-center text-sm text-slate-600">{children}</p>
export const ErrorNote = ({ error }: { error: string | null }) => (error ? <p role="alert" className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</p> : null)
export const Notice = ({ tone, children }: { tone: 'success' | 'warning'; children: ReactNode }) => (
  <p role="status" className={cx('rounded-md px-4 py-2 text-sm ring-1 ring-inset', tone === 'success' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-amber-50 text-amber-900 ring-amber-200')}>{children}</p>
)

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-slate-200/70', className)} />
}

export function Modal({ title, onClose, children, width = 'max-w-md', fill }: { title: string; onClose: () => void; children: ReactNode; width?: string; fill?: boolean }) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={cx('w-full rounded-lg bg-white shadow-pop outline-none', fill ? 'flex h-[90vh] flex-col overflow-hidden' : 'space-y-4 p-6', fill ? 'max-w-5xl' : width)} onClick={(e) => e.stopPropagation()}>
        <div className={cx('flex items-start justify-between gap-4', fill && 'h-12 shrink-0 items-center border-b border-slate-200 px-6')}>
          <h2 className={cx('min-w-0 truncate font-semibold', fill ? 'text-base' : 'text-lg')}>{title}</h2>
          <button onClick={onClose} aria-label="Close" className="-m-2 rounded-md p-2 text-slate-600 transition-colors duration-150 hover:bg-slate-100"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
