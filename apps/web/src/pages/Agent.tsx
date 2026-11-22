import { AlertCircle, ArrowUp, FileCheck, FileX, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, money } from '../api'
import type { AgentBriefing, AgentReply, Block, Tone } from '../agentTypes'
import { Badge, Button, Skeleton, cx } from '../ui'

type Msg = { id: number; role: 'user'; text: string } | { id: number; role: 'agent'; reply: AgentReply }

const toneText: Record<Tone, string> = { neutral: 'text-slate-900', good: 'text-emerald-700', bad: 'text-red-700', warn: 'text-amber-800' }
const label = (s: string) => s.replace(/_/g, ' ')

const AgentMark = () => (
  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white" aria-hidden="true"><ShieldCheck size={16} /></span>
)

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((b, n) => {
        if (b.type === 'text') {
          return <div key={n} className="space-y-2 text-base text-slate-800">{b.text.split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-wrap">{p}</p>)}</div>
        }
        if (b.type === 'stats') {
          return (
            <dl key={n} className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
              {b.items.map((s) => (
                <div key={s.label} className="min-w-0">
                  <dt className="text-xs text-slate-500">{s.label}</dt>
                  <dd className={cx('text-base font-semibold tabular-nums', toneText[s.tone ?? 'neutral'])}>{s.value}</dd>
                  {s.hint && <dd className="text-xs text-slate-500">{s.hint}</dd>}
                </div>
              ))}
            </dl>
          )
        }
        if (b.type === 'flags') {
          return (
            <ul key={n} className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {b.items.map((f) => (
                <li key={f.id}>
                  <Link to={`/flags/${f.id}`} className="flex items-start gap-4 px-4 py-3 transition-colors duration-150 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium"><span className="capitalize">{label(f.type)}</span><Badge value={f.severity} /></div>
                      <p className="mt-1 text-sm text-slate-600">{f.summary}</p>
                      <p className="text-xs text-slate-500">{f.vendorName} · {f.invoiceNumber}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{money(f.exposureMinor, f.currency)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
        if (b.type === 'invoices') {
          return (
            <ul key={n} className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {b.items.map((i) => (
                <li key={i.id}>
                  <Link to="/invoices" className="flex items-start gap-4 px-4 py-3 transition-colors duration-150 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium"><span>{i.invoiceNumber}</span><Badge value={i.status} />
                        {i.openFlags > 0 && <Badge value="high">{i.openFlags} open flag{i.openFlags === 1 ? '' : 's'}</Badge>}</div>
                      <p className="text-xs text-slate-500">{i.vendorName}</p>
                      <p className={cx('mt-1 flex items-center gap-1 text-xs', i.canPay ? 'text-emerald-700' : 'text-slate-600')}>
                        {i.status === 'paid' ? 'Paid' : i.canPay ? 'Ready to pay' : 'Not payable yet'}
                      </p>
                      {i.missingDocs.length > 0 && <p className="mt-1 flex items-center gap-1 text-xs text-amber-800"><FileX size={16} />Missing {i.missingDocs.join(', ')}</p>}
                      {i.missingDocs.length === 0 && <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><FileCheck size={16} />All documents on file</p>}
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{money(i.totalMinor, i.currency)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
        return <div key={n}><Link to={b.to} className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 transition-colors duration-150 hover:bg-slate-50">{b.label}</Link></div>
      })}
    </div>
  )
}

function AgentMessage({ reply }: { reply: AgentReply }) {
  return (
    <div className="flex gap-4">
      <AgentMark />
      <div className="min-w-0 flex-1 space-y-4">
        <Blocks blocks={reply.blocks} />
        <div className="space-y-2">
          {reply.steps.length > 0 && (
            <details className="group text-sm text-slate-600">
              <summary className="inline-flex h-8 items-center rounded-md px-2 -ml-2 transition-colors duration-150 hover:bg-slate-100">Looked at {reply.steps.length} thing{reply.steps.length === 1 ? '' : 's'}</summary>
              <ul className="mt-2 list-inside list-disc space-y-1 pl-2 text-xs text-slate-600">{reply.steps.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </details>
          )}
          <p className="text-xs text-slate-500">Local · no AI tokens used</p>
        </div>
      </div>
    </div>
  )
}

const Thinking = () => (
  <div className="flex items-center gap-4" role="status" aria-label="Agent is working">
    <AgentMark />
    <span className="flex gap-1">{[0, 150, 300].map((d) => <span key={d} style={{ animationDelay: `${d}ms` }} className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />)}</span>
  </div>
)

export default function Agent() {
  const [briefing, setBriefing] = useState<AgentBriefing | null>(null)
  const [briefErr, setBriefErr] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<{ text: string; error: string } | null>(null)
  const [text, setText] = useState('')
  const [chips, setChips] = useState<string[]>([])
  const end = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const nextId = useRef(1)

  const loadBriefing = useCallback(() => {
    setBriefErr(null)
    api<AgentBriefing>('/agent/briefing').then((b) => { setBriefing(b); setChips(b.suggestions) }).catch((e) => setBriefErr(e.message))
  }, [])
  useEffect(loadBriefing, [loadBriefing])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs, busy, failed, briefing])
  useEffect(() => {
    const el = area.current
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 160)}px` }
  }, [text])

  const send = async (raw: string, retry = false) => {
    const message = raw.trim()
    if (!message || busy) return
    setBusy(true); setFailed(null)
    if (!retry) { setMsgs((m) => [...m, { id: nextId.current++, role: 'user', text: message }]); setText('') }
    try {
      const reply = await api<AgentReply>('/agent/chat', { body: { message } })
      setMsgs((m) => [...m, { id: nextId.current++, role: 'agent', reply }])
      setChips(reply.suggestions)
    } catch (e) { setFailed({ text: message, error: (e as Error).message }) }
    setBusy(false)
  }

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col lg:h-screen">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:py-12">
          {briefing ? <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{briefing.greeting}</h1>
            : briefErr ? <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Hello</h1>
            : <Skeleton className="h-8 w-64" />}

          {briefing && <AgentMessage reply={briefing} />}
          {!briefing && !briefErr && (
            <div className="flex gap-4" aria-busy="true"><AgentMark /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-16 w-full" /></div></div>
          )}
          {briefErr && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <span className="flex items-center gap-2"><AlertCircle size={20} />Couldn't load today's briefing. {briefErr}</span>
              <Button size="sm" variant="ghost" onClick={loadBriefing}>Retry</Button>
            </div>
          )}

          {msgs.map((m) => m.role === 'user' ? (
            <div key={m.id} className="flex justify-end"><p className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-brand-50 px-4 py-2 text-base text-slate-900 ring-1 ring-inset ring-brand-100">{m.text}</p></div>
          ) : <AgentMessage key={m.id} reply={m.reply} />)}

          {busy && <Thinking />}
          {failed && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <span className="flex items-center gap-2"><AlertCircle size={20} />Couldn't get an answer. {failed.error}</span>
              <Button size="sm" variant="ghost" onClick={() => send(failed.text, true)}>Retry</Button>
            </div>
          )}
          <div ref={end} />
        </div>
      </div>

      <div className="shrink-0 bg-slate-50 px-4 pb-4 sm:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Suggestions">
              {chips.map((c) => (
                <button key={c} disabled={busy} onClick={() => send(c)} className="inline-flex min-h-8 items-center rounded-full border border-slate-300 bg-white px-3 text-sm text-slate-700 transition-colors duration-150 hover:border-brand-500 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50">{c}</button>
              ))}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); send(text) }} className="flex items-end gap-2 rounded-lg border border-slate-300 bg-white p-2 shadow-card transition-colors duration-150 focus-within:border-brand-500 hover:border-slate-400">
            <textarea
              ref={area} rows={1} value={text} onChange={(e) => setText(e.target.value)} aria-label="Message the agent"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text) } }}
              placeholder="Ask about invoices, flags or what's safe to pay"
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-base text-slate-900 outline-none placeholder:text-slate-500 focus-visible:outline-none"
            />
            <button type="submit" disabled={!text.trim() || busy} aria-label="Send" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white transition-colors duration-150 hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"><ArrowUp size={20} /></button>
          </form>
          <p className="text-center text-xs text-slate-500">Local · no AI tokens used</p>
        </div>
      </div>
    </div>
  )
}
