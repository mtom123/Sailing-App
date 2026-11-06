import { useEffect, useState } from 'react'
import { Copy, ExternalLink, Phone, Send } from 'lucide-react'
import { getPhoto } from '../lib/markStore.js'
import { markType } from '../lib/marks.js'
import { OBSENMER_FORM, TETHYS_FORM, shareReport, sightingReport } from '../lib/sightingReport.js'
import { useAppStore } from '../store/useAppStore.js'

/*
 * Invio di un avvistamento ai ricercatori. Le foto si leggono prima del tocco:
 * Safari apre il foglio di condivisione solo subito dopo il gesto.
 */

const btn = 'touch flex items-center justify-center gap-1.5 rounded-md border border-line bg-surface py-2.5 text-[calc(10px*var(--fs))] font-semibold tracking-widest text-paper'

const OUTCOME = {
  sent: 'Segnalazione pronta nel foglio di condivisione',
  'sent-no-photos': 'Inviato il testo: le foto vanno allegate a mano',
  copied: 'Testo copiato',
}

export default function SightingReport({ mark }) {
  const vesselName = useAppStore((s) => s.boat.vesselName)
  const [files, setFiles] = useState([])
  const [message, setMessage] = useState(null)
  const photoKey = (mark.photos ?? []).join(',')

  useEffect(() => {
    let alive = true
    Promise.all((mark.photos ?? []).map((id) => getPhoto(id).catch(() => null))).then((photos) => {
      if (!alive) return
      setFiles(photos.filter(Boolean).map((p, i) => new File([p.blob], `avvistamento-${i + 1}.jpg`, { type: 'image/jpeg' })))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey])

  const text = sightingReport(mark, vesselName)
  const send = async () => {
    try {
      const outcome = await shareReport(text, files)
      setMessage(OUTCOME[outcome] ?? null)
    } catch {
      setMessage('Invio non riuscito')
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setMessage(OUTCOME.copied)
    } catch {
      setMessage('Copia non riuscita')
    }
  }

  return (
    <div className="mt-3 border-t border-line pt-2">
      <div className="label pb-1">Segnala ai ricercatori</div>
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" onClick={send} className={btn}>
          <Send size={13} /> INVIA
        </button>
        <button type="button" onClick={copy} className={btn}>
          <Copy size={13} /> COPIA DATI
        </button>
        {markType(mark.type).group === 'cetacei' && (
          <a href={TETHYS_FORM} target="_blank" rel="noopener noreferrer" className={btn}>
            <ExternalLink size={13} /> MODULO TETHYS
          </a>
        )}
        <a href={OBSENMER_FORM} target="_blank" rel="noopener noreferrer" className={btn}>
          <ExternalLink size={13} /> OBSENMER
        </a>
      </div>
      {message && <div className="pt-1 text-[calc(10px*var(--fs))] font-semibold text-phos">{message}</div>}
      <div className="pt-1 text-[calc(10px*var(--fs))] leading-relaxed text-fog">
        Copia i dati e incollali nel modulo. Tethys accetta solo cetacei e vuole una foto o un video; OBSenMER è in francese.
      </div>
      <a href="tel:1530" className="touch mt-1.5 flex items-center gap-1.5 text-[calc(11px*var(--fs))] font-semibold text-danger">
        <Phone size={13} /> Animale ferito o spiaggiato: Guardia Costiera 1530
      </a>
    </div>
  )
}
