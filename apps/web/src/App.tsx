import { Code2, CreditCard, FileText, Flag, LayoutDashboard, LogOut, Menu, MessageSquare, Plug, ShieldCheck, Settings as SettingsIcon, Upload, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { getToken, setToken } from './api'
import { useApi } from './hooks'
import Agent from './pages/Agent'
import Billing from './pages/Billing'
import Developers from './pages/Developers'
import Dashboard from './pages/Dashboard'
import Documents from './pages/Documents'
import FlagDetail from './pages/FlagDetail'
import Flags from './pages/Flags'
import Integrations from './pages/Integrations'
import Invoices from './pages/Invoices'
import Login from './pages/Login'
import Settings from './pages/Settings'
import { Skeleton, cx } from './ui'

const nav = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/flags', label: 'Flags', icon: Flag },
  { to: '/invoices', label: 'Invoices & contracts', icon: FileText },
  { to: '/documents', label: 'Upload', icon: Upload },
  { to: '/integrations', label: 'Integrations', icon: Plug },
  { to: '/developers', label: 'Developers', icon: Code2 },
  { to: '/billing', label: 'Billing & pricing', icon: CreditCard },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

interface Me { user: { id: string; name: string; email: string; role: string }; org: { name: string; feeShareBps: number } }

const item = ({ isActive }: { isActive: boolean }) =>
  cx('flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150', isActive ? 'bg-white font-medium text-slate-900 shadow-card' : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900')

export const Mark = ({ size = 32 }: { size?: number }) => (
  <span style={{ width: size, height: size }} className="inline-flex shrink-0 items-center justify-center rounded-md bg-brand-600 text-white" aria-hidden="true">
    <ShieldCheck size={size / 2} />
  </span>
)

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')

function Sidebar({ me, onNavigate, onSignOut }: { me: Me | null; onNavigate: () => void; onSignOut: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-3 px-2 pt-2">
        <Mark />
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-5">PayGuard</div>
          <div className="truncate text-xs text-slate-500">{me ? me.org.name : <Skeleton className="mt-1 h-3 w-24" />}</div>
        </div>
      </div>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-1 overflow-y-auto">
        <NavLink to="/" end onClick={onNavigate} className={item}><MessageSquare size={20} />Ask the agent</NavLink>
        <div className="my-2 border-t border-slate-200" />
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} onClick={onNavigate} className={item}><Icon size={20} />{label}</NavLink>
        ))}
      </nav>
      <div className="flex items-center gap-3 border-t border-slate-200 pt-4">
        {me ? (
          <>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-medium text-brand-700" aria-hidden="true">{initials(me.user.name)}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{me.user.name}</div>
              <div className="truncate text-xs text-slate-500">{me.user.email}</div>
              <div className="truncate text-xs capitalize text-slate-500">{me.user.role}</div>
            </div>
          </>
        ) : <Skeleton className="h-10 flex-1" />}
        <button onClick={onSignOut} aria-label="Sign out" title="Sign out" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors duration-150 hover:bg-slate-200/60 hover:text-slate-900"><LogOut size={20} /></button>
      </div>
    </div>
  )
}

function Layout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const authed = !!getToken()
  const { data: me } = useApi<Me>('/me')
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!authed) return <Navigate to="/login" replace />
  const signOut = () => { setToken(null); navigate('/login') }
  const isAgent = pathname === '/'
  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-slate-200 bg-slate-100 lg:block">
        <Sidebar me={me} onNavigate={() => {}} onSignOut={signOut} />
      </aside>
      <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-slate-200 bg-slate-100 px-4 lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="-ml-2 flex h-10 w-10 items-center justify-center rounded-md text-slate-700 hover:bg-slate-200/60"><Menu size={20} /></button>
        <Mark size={24} /><span className="text-sm font-semibold">PayGuard</span>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <div className="relative h-full w-64 max-w-[85vw] border-r border-slate-200 bg-slate-100 shadow-pop">
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-200/60"><X size={20} /></button>
            <Sidebar me={me} onNavigate={() => setOpen(false)} onSignOut={signOut} />
          </div>
        </div>
      )}
      <main className={cx('min-w-0 flex-1', isAgent ? 'p-0' : 'mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-10')}><Outlet /></main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route index element={<Agent />} />
          <Route path="overview" element={<Dashboard />} />
          <Route path="flags" element={<Flags />} />
          <Route path="flags/:id" element={<FlagDetail />} />
          <Route path="documents" element={<Documents />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="developers" element={<Developers />} />
          <Route path="billing" element={<Billing />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
