import { Check, Copy, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api, money } from '../api'
import { useApi } from '../hooks'
import { Badge, Button, Card, Empty, ErrorNote, Input, Notice, PageHeader, cx } from '../ui'
import { WEBHOOK_EVENTS, type ValidateRequest, type ValidateResponse, type Verdict } from '../validationTypes'

const th = 'h-10 px-3 text-left text-xs font-medium text-slate-600'
const td = 'px-3 py-2 align-top'
const label = 'text-xs font-medium text-slate-700'

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  const copy = () => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }).catch(() => {}) }
  return <Button variant="ghost" size="sm" onClick={copy} aria-label="Copy code">{done ? <Check size={16} /> : <Copy size={16} />}{done ? 'Copied' : 'Copy'}</Button>
}

function Code({ text, title }: { text: string; title?: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="flex h-12 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4">
        <span className="text-xs font-medium text-slate-600">{title}</span>
        <CopyButton text={text} />
      </div>
      <pre className="overflow-x-auto bg-slate-900 p-4 text-xs leading-6 text-slate-100"><code>{text}</code></pre>
    </div>
  )
}

const verdictStyle: Record<Verdict, { box: string; text: string }> = {
  approve: { box: 'bg-emerald-50 text-emerald-800 ring-emerald-200', text: 'Approve' },
  review: { box: 'bg-amber-50 text-amber-900 ring-amber-200', text: 'Review' },
  block: { box: 'bg-red-50 text-red-800 ring-red-200', text: 'Block' },
}

interface FormLine { description: string; quantity: string; unitPrice: string }
const sample = {
  vendor: 'Vertex Systems India Private Limited', invoiceNumber: 'INV-TEST-1', invoiceDate: '2026-11-27', poNumber: 'PO-2026-00871', contractNumber: 'CT-2026-014',
  lines: [
    { description: 'Business laptop, 14-inch, 16GB RAM / 512GB SSD', quantity: '10', unitPrice: '52000' },
    { description: '27-inch IPS monitor', quantity: '4', unitPrice: '12000' },
    { description: 'USB-C docking station', quantity: '2', unitPrice: '8000' },
  ] as FormLine[],
}

function Tester() {
  const [f, setF] = useState(sample)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [res, setRes] = useState<ValidateResponse | null>(null)
  const set = (k: keyof typeof sample) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const setLine = (i: number, k: keyof FormLine, v: string) => setF({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) })

  const run = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    const body: ValidateRequest = {
      vendor: f.vendor.trim(), invoiceNumber: f.invoiceNumber.trim(), invoiceDate: f.invoiceDate,
      ...(f.poNumber.trim() && { poNumber: f.poNumber.trim() }), ...(f.contractNumber.trim() && { contractNumber: f.contractNumber.trim() }),
      lines: f.lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
      persist: false,
    }
    try { setRes(await api<ValidateResponse>('/validate', { method: 'POST', body })) }
    catch (x) { setRes(null); setErr(`Could not run the check: ${(x as Error).message}. The validation endpoint may not be available yet.`) }
    finally { setBusy(false) }
  }

  const total = f.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0)
  const cur = res?.currency ?? 'INR'

  return (
    <Card title="Try it">
      <div className="space-y-6">
        <Notice tone="success">Dry run - nothing is saved. No invoice is stored and no flags are raised.</Notice>
        <form onSubmit={run} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label htmlFor="t-vendor" className={label}>Vendor</label><Input id="t-vendor" className="mt-1" value={f.vendor} onChange={set('vendor')} required /></div>
            <div><label htmlFor="t-inv" className={label}>Invoice number</label><Input id="t-inv" className="mt-1" value={f.invoiceNumber} onChange={set('invoiceNumber')} required /></div>
            <div><label htmlFor="t-date" className={label}>Invoice date</label><Input id="t-date" type="date" className="mt-1" value={f.invoiceDate} onChange={set('invoiceDate')} required /></div>
            <div><label htmlFor="t-po" className={label}>PO number</label><Input id="t-po" className="mt-1" value={f.poNumber} onChange={set('poNumber')} /></div>
            <div><label htmlFor="t-ct" className={label}>Contract number</label><Input id="t-ct" className="mt-1" value={f.contractNumber} onChange={set('contractNumber')} /></div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-4">
              <h3 className="text-sm font-semibold">Lines</h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => setF({ ...f, lines: [...f.lines, { description: '', quantity: '1', unitPrice: '0' }] })}><Plus size={16} />Add row</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="border-b border-slate-200"><th className={th}>Description</th><th className={cx(th, 'w-24')}>Qty</th><th className={cx(th, 'w-32')}>Unit price (₹)</th><th className="w-12"><span className="sr-only">Remove</span></th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {f.lines.map((l, i) => (
                    <tr key={i}>
                      <td className={td}><Input aria-label={`Line ${i + 1} description`} value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} required /></td>
                      <td className={td}><Input aria-label={`Line ${i + 1} quantity`} type="number" min="0" step="any" className="tabular-nums" value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} required /></td>
                      <td className={td}><Input aria-label={`Line ${i + 1} unit price`} type="number" min="0" step="any" className="tabular-nums" value={l.unitPrice} onChange={(e) => setLine(i, 'unitPrice', e.target.value)} required /></td>
                      <td className="px-1 py-2 align-top"><button type="button" aria-label={`Remove line ${i + 1}`} disabled={f.lines.length <= 1} onClick={() => setF({ ...f, lines: f.lines.filter((_, j) => j !== i) })} className="flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40"><Trash2 size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-right text-sm tabular-nums text-slate-600">Total {money(Math.round(total * 100))}</p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" disabled={busy}>{busy ? 'Checking...' : 'Validate invoice'}</Button>
            <Button type="button" variant="ghost" onClick={() => { setF(sample); setRes(null); setErr(null) }}>Reset sample</Button>
          </div>
          <p className="text-sm text-slate-600"><strong className="font-medium text-slate-900">Fix the price:</strong> change the laptop unit price to 50000 and run it again to see the verdict become approve.</p>
        </form>

        <ErrorNote error={err} />

        {res && (
          <div className="space-y-4" aria-live="polite">
            <div className={cx('flex flex-wrap items-center justify-between gap-4 rounded-lg p-6 ring-1 ring-inset', verdictStyle[res.verdict].box)}>
              <div>
                <p className="text-xl font-semibold">{verdictStyle[res.verdict].text}</p>
                <p className="mt-1 text-sm">{res.canPay ? 'Safe to pay.' : res.verdict === 'review' ? 'A person should look before paying.' : 'Do not pay this invoice.'}</p>
              </div>
              <dl className="text-sm sm:text-right">
                <div className="flex gap-2 sm:justify-end"><dt>canPay</dt><dd className="font-mono font-semibold">{String(res.canPay)}</dd></div>
                <div className="flex gap-2 sm:justify-end"><dt>Total</dt><dd className="font-semibold tabular-nums">{money(Math.round(res.total * 100), cur)}</dd></div>
              </dl>
            </div>

            {res.findings.length === 0 ? <p className="text-sm text-slate-600">No findings.</p> : (
              <ul className="space-y-4">
                {res.findings.map((x, i) => (
                  <li key={i} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge value={x.severity}>{x.severity}</Badge>
                      <span className="text-xs font-medium text-slate-600">{x.type.replace(/_/g, ' ')}</span>
                      {x.exposure > 0 && <span className="ml-auto text-sm font-semibold tabular-nums">{money(Math.round(x.exposure * 100), cur)} at risk</span>}
                    </div>
                    <p className="mt-2 text-sm text-slate-900">{x.message}</p>
                    {x.clause && (x.clause.text || x.clause.ref) && (
                      <blockquote className="mt-2 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                        {x.clause.text && <p>“{x.clause.text}”</p>}
                        <footer className="mt-1 text-xs text-slate-600">{[x.clause.ref && `Clause ${x.clause.ref}`, x.clause.page != null && `page ${x.clause.page}`].filter(Boolean).join(', ')}</footer>
                      </blockquote>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {res.missingDocs.length > 0 && <p className="text-sm text-slate-700"><span className="font-medium">Missing documents:</span> {res.missingDocs.join(', ')}</p>}
          </div>
        )}
      </div>
    </Card>
  )
}

const bodyJson = JSON.stringify({
  vendor: sample.vendor, invoiceNumber: sample.invoiceNumber, invoiceDate: sample.invoiceDate, poNumber: sample.poNumber, contractNumber: sample.contractNumber,
  lines: sample.lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
}, null, 2)

const responseJson = `{
  "verdict": "block",
  "canPay": false,
  "total": 616000,
  "currency": "INR",
  "findings": [
    {
      "type": "rate_drift",
      "severity": "high",
      "message": "Unit price is above the contract rate",
      "exposure": 20000,
      "clause": { "ref": "4.1", "page": 3, "text": "..." }
    }
  ],
  "missingDocs": [],
  "dryRun": true,
  "checkedAt": "2026-11-27T10:00:00.000Z",
  "localOnly": true
}`

function samples(origin: string): Record<string, string> {
  const url = `${origin}/api/v1/validate`
  const compact = JSON.stringify(JSON.parse(bodyJson))
  return {
    cURL: `curl -X POST ${url} \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "content-type: application/json" \\
  -d '${compact}'`,
    Node: `const res = await fetch("${url}", {
  method: "POST",
  headers: { "x-api-key": "YOUR_API_KEY", "content-type": "application/json" },
  body: JSON.stringify(${bodyJson.replace(/\n/g, '\n  ')}),
})
const result = await res.json()
if (result.canPay) await payInvoice(invoice) // pay only on approve`,
    Python: `import requests

res = requests.post(
    "${url}",
    headers={"x-api-key": "YOUR_API_KEY"},
    json=${bodyJson.replace(/\n/g, '\n    ').replace(/: false/g, ': False')},
)
result = res.json()
if result["canPay"]:
    pay_invoice(invoice)  # pay only on approve`,
  }
}

function CallIt() {
  const [lang, setLang] = useState('cURL')
  const all = samples(window.location.origin)
  return (
    <Card title="Call it from your app">
      <div className="space-y-4">
        <p className="max-w-prose text-sm text-slate-600">Send the same JSON body to <code className="rounded bg-slate-100 px-1 text-xs">POST {window.location.origin}/api/v1/validate</code> with your key in the <code className="rounded bg-slate-100 px-1 text-xs">x-api-key</code> header. <Link to="/integrations" className="font-medium text-brand-700 underline underline-offset-2">Create an API key</Link> and replace YOUR_API_KEY.</p>
        <div role="tablist" aria-label="Language" className="flex gap-2">
          {Object.keys(all).map((k) => (
            <button key={k} role="tab" aria-selected={lang === k} onClick={() => setLang(k)} className={cx('h-8 rounded-md px-3 text-sm font-medium transition-colors', lang === k ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-100')}>{k}</button>
          ))}
        </div>
        <Code title={`Request, ${lang}`} text={all[lang]!} />
        <Code title="Response" text={responseJson} />
      </div>
    </Card>
  )
}

const eventDocs: [string, string][] = [
  ['document.processed', 'A document finished extraction and checks.'],
  ['document.failed', 'A document could not be read.'],
  ['flag.created', 'A new flag was raised on an invoice.'],
  ['flag.resolved', 'A flag was marked resolved and its saving verified.'],
  ['invoice.payable', 'An invoice passed all checks and is safe to pay.'],
  ['webhook.test', 'You pressed Send test event.'],
]

const envelope = `{
  "id": "evt_01HZX...",
  "event": "flag.created",
  "sentAt": "2026-11-27T10:00:00.000Z",
  "data": { }
}`

const verifySnippet = `import crypto from "node:crypto"

// rawBody must be the exact bytes received, before JSON parsing
function isValid(rawBody, header, secret) {
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(header ?? "")
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// header: req.headers["x-payguard-signature"]`

interface Hooks {
  events: string[]
  subscribed: string[]
  deliveries: { id: string; event: string; status: string; statusCode: number | null; error: string | null; attempt: number; durationMs: number | null; createdAt: string }[]
}

function Webhooks() {
  const { data, error, reload } = useApi<Hooks>('/hooks')
  const [sel, setSel] = useState<string[] | null>(null)
  const [msg, setMsg] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const events = data?.events?.length ? data.events : [...WEBHOOK_EVENTS]
  const current = sel ?? data?.subscribed ?? []
  const toggle = (e: string) => setSel(current.includes(e) ? current.filter((x) => x !== e) : [...current, e])

  const save = async () => {
    setBusy(true); setErr(null); setMsg(null)
    try { await api('/hooks/events', { method: 'PUT', body: { events: current } }); setMsg({ tone: 'success', text: 'Subscriptions saved.' }); setSel(null); reload() }
    catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  const test = async () => {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const r = await api<{ ok: boolean; statusCode: number | null; error: string | null; durationMs: number }>('/hooks/test', { method: 'POST', body: {} })
      setMsg(r.ok ? { tone: 'success', text: `Test delivered: HTTP ${r.statusCode} in ${r.durationMs} ms.` } : { tone: 'warning', text: `Test failed${r.statusCode ? ` with HTTP ${r.statusCode}` : ''}${r.error ? `: ${r.error}` : ''}.` })
      reload()
    } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }

  return (
    <Card title="Get notified">
      <div className="space-y-8">
        <div>
          <h3 className="text-sm font-semibold">Events</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[400px] text-sm">
              <thead><tr className="border-b border-slate-200"><th className={th}>Event</th><th className={th}>When it fires</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {eventDocs.map(([e, w]) => <tr key={e}><td className="h-10 whitespace-nowrap px-3 font-mono text-xs">{e}</td><td className="px-3 text-slate-700">{w}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="min-w-0 space-y-2"><h3 className="text-sm font-semibold">Payload</h3><Code title="Every webhook POST body" text={envelope} /></div>
          <div className="min-w-0 space-y-2"><h3 className="text-sm font-semibold">Verify the signature</h3><Code title="Node, HMAC sha256 in x-payguard-signature" text={verifySnippet} /></div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Your webhook</h3>
          {error ? <ErrorNote error={`Webhook settings are unavailable right now (${error}). The rest of this page still works.`} /> : !data ? <p className="text-sm text-slate-600">Loading...</p> : (
            <>
              <fieldset>
                <legend className="text-xs font-medium text-slate-700">Send me these events</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {events.map((e) => (
                    <label key={e} className="flex h-10 items-center gap-3 rounded-md border border-slate-200 px-3 text-sm">
                      <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={current.includes(e)} onChange={() => toggle(e)} />
                      <span className="font-mono text-xs">{e}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap gap-4">
                <Button onClick={save} disabled={busy || sel === null}>Save events</Button>
                <Button variant="ghost" onClick={test} disabled={busy}>Send test event</Button>
              </div>
              {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
              <ErrorNote error={err} />
              <div>
                <h4 className="text-xs font-medium text-slate-600">Recent deliveries</h4>
                {data.deliveries.length === 0 ? <Empty>No deliveries yet. Send a test event.</Empty> : (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead><tr className="border-b border-slate-200"><th className={th}>Event</th><th className={th}>Status</th><th className={cx(th, 'text-right')}>Code</th><th className={cx(th, 'text-right')}>Attempt</th><th className={cx(th, 'text-right')}>Time</th><th className={th}>When</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.deliveries.map((d) => (
                          <tr key={d.id}>
                            <td className="h-10 px-3 font-mono text-xs">{d.event}</td>
                            <td className="px-3" title={d.error ?? undefined}><Badge value={d.status === 'success' || d.status === 'delivered' ? 'resolved' : d.status === 'pending' ? 'medium' : 'high'}>{d.status}</Badge></td>
                            <td className="px-3 text-right tabular-nums">{d.statusCode ?? '-'}</td>
                            <td className="px-3 text-right tabular-nums">{d.attempt}</td>
                            <td className="px-3 text-right tabular-nums">{d.durationMs != null ? `${d.durationMs} ms` : '-'}</td>
                            <td className="whitespace-nowrap px-3 text-slate-600">{new Date(d.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

export default function Developers() {
  return (
    <div className="space-y-8">
      <PageHeader title="Developers" description="Use PayGuard as a validation layer in front of the payment step of any app." />

      <Card title="Validate before you pay">
        <div className="max-w-prose space-y-4 text-sm text-slate-700">
          <p>Instead of paying every invoice your system receives, ask us first. We check it against your contracts and past invoices and answer in one call.</p>
          <ol className="list-decimal space-y-2 pl-6 marker:font-medium marker:text-slate-500">
            <li>Your app sends the invoice to us.</li>
            <li>We return <strong>approve</strong>, <strong>review</strong> or <strong>block</strong>, with the evidence behind it.</li>
            <li>Your app pays only on approve.</li>
          </ol>
          <p className="text-slate-600">Deterministic - no AI tokens: validation runs the same duplicate and rate rules as the dashboard.</p>
        </div>
      </Card>

      <Tester />
      <CallIt />
      <Webhooks />
    </div>
  )
}
