import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ajouterMorceau, listerMorceaux, type Morceau } from './api'

const INTERVALLE_SUIVI_MS = 2000

function duree(s: number | null) {
  if (s == null) return ''
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function Etat({ morceau }: { morceau: Morceau }) {
  if (morceau.statut === 'pret') return <span className="etat pret">Prêt</span>
  if (morceau.statut === 'echec')
    return (
      <span className="etat echec" title={morceau.echec?.code}>
        Échec ({morceau.echec?.etape}) : {morceau.echec?.message}
      </span>
    )
  return <span className="etat en-cours">{morceau.etape ? `${capitaliser(morceau.etape)}…` : 'En attente…'}</span>
}

const capitaliser = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function Bibliotheque() {
  const [morceaux, setMorceaux] = useState<Morceau[] | null>(null)
  const [lien, setLien] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  const rafraichir = useCallback(
    () =>
      listerMorceaux()
        .then(setMorceaux)
        .catch(() => setErreur('Serveur injoignable.')),
    [],
  )

  useEffect(() => {
    void rafraichir()
  }, [rafraichir])

  const traitementEnCours = morceaux?.some((m) => m.statut === 'en_cours') ?? false
  useEffect(() => {
    if (!traitementEnCours) return
    const id = setInterval(rafraichir, INTERVALLE_SUIVI_MS)
    return () => clearInterval(id)
  }, [traitementEnCours, rafraichir])

  async function soumettre(e: FormEvent) {
    e.preventDefault()
    setErreur(null)
    setEnvoi(true)
    try {
      const morceau = await ajouterMorceau(lien)
      setLien('')
      if (morceau.statut === 'pret') location.hash = `#/morceau/${morceau.video_id}`
      await rafraichir()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <>
      <form className="ajout" onSubmit={soumettre}>
        <input
          type="url"
          required
          placeholder="Coller un lien YouTube"
          value={lien}
          onChange={(e) => setLien(e.target.value)}
          aria-label="Lien YouTube"
        />
        <button disabled={envoi || !lien.trim()}>Ajouter</button>
      </form>
      {erreur && <p className="erreur">{erreur}</p>}

      {morceaux?.length === 0 && <p className="vide">Aucun morceau pour l'instant. Colle un lien YouTube pour commencer.</p>}
      <ul className="morceaux">
        {morceaux?.map((m) => (
          <li key={m.video_id}>
            <img src={`https://i.ytimg.com/vi/${m.video_id}/mqdefault.jpg`} alt="" width={120} height={68} />
            <div>
              {m.statut === 'pret' ? (
                <a href={`#/morceau/${m.video_id}`}>{m.titre ?? m.video_id}</a>
              ) : (
                <strong>{m.titre ?? m.video_id}</strong>
              )}
              <div className="meta">
                {duree(m.duree_s)} <Etat morceau={m} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
