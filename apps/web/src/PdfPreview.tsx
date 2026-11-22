import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { fetchDocumentBlob } from './api'
import { Modal, Skeleton } from './ui'

export interface PreviewTarget { id: string; title: string; page?: number | null }

/** Modal PDF viewer. The file is fetched with the session token, so it never needs a public URL. */
export function PdfPreview({ target, onClose }: { target: PreviewTarget; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    setUrl(null); setError(null)
    fetchDocumentBlob(target.id)
      .then((b) => { if (!cancelled) { objectUrl = URL.createObjectURL(b); setUrl(objectUrl) } })
      .catch((e) => !cancelled && setError(e.message))
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [target.id])

  const src = url ? `${url}#page=${target.page ?? 1}&view=FitH` : null
  return (
    <Modal title={target.title} onClose={onClose} fill>
      <div className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-6 text-sm">
        <span className="text-xs text-slate-500">{target.page ? `Opened at page ${target.page}` : 'Document preview'}</span>
        {src && <a href={url!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-brand-700 underline underline-offset-2 hover:text-brand-600"><ExternalLink size={16} />Open in new tab</a>}
      </div>
      <div className="min-h-0 flex-1 bg-slate-100">
        {error ? <p role="alert" className="p-6 text-sm text-red-700">{error}</p> : src ? <iframe key={src} title={target.title} src={src} className="h-full w-full" /> : <div className="space-y-4 p-6" aria-busy="true"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-64 w-full" /></div>}
      </div>
    </Modal>
  )
}
