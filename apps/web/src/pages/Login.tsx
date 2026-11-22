import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setToken } from '../api'
import { Button, Card, ErrorNote, Input } from '../ui'

export default function Login() {
  const [email, setEmail] = useState('admin@apex.test')
  const [password, setPassword] = useState('admin123')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { const r = await api<{ token: string }>('/auth/login', { body: { email, password } }); setToken(r.token); navigate('/') }
    catch (err) { setError((err as Error).message) }
    setBusy(false)
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-600 text-white" aria-hidden="true"><ShieldCheck size={24} /></span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">PayGuard</h1>
            <p className="mt-1 text-sm text-slate-600">Check every vendor invoice before you pay.</p>
          </div>
        </div>
        <Card>
          <div className="space-y-4">
            <label className="block space-y-2 text-sm font-medium"><span>Email</span><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="username" /></label>
            <label className="block space-y-2 text-sm font-medium"><span>Password</span><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" /></label>
            <ErrorNote error={error} />
            <Button className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
            <p className="text-xs text-slate-500">Demo: admin@apex.test / admin123</p>
          </div>
        </Card>
      </form>
    </div>
  )
}
