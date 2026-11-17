export type Statut = 'en_cours' | 'pret' | 'echec'

export type Echec = { etape: string; code: string; message: string }

export type Morceau = {
  video_id: string
  titre: string | null
  duree_s: number | null
  statut: Statut
  /** Étape du traitement en cours ; null si en attente, prêt ou en échec. */
  etape: string | null
  echec: Echec | null
  ajoute_le: string
}

export class ErreurApi extends Error {}

async function lire<T>(res: Response): Promise<T> {
  const corps = await res.json().catch(() => null)
  if (!res.ok) throw new ErreurApi(corps?.message ?? corps?.detail ?? `Erreur ${res.status}`)
  return corps as T
}

export const listerMorceaux = () => fetch('/api/morceaux').then((r) => lire<Morceau[]>(r))

export const ajouterMorceau = (lien: string) =>
  fetch('/api/morceaux', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lien }),
  }).then((r) => lire<Morceau>(r))

export const obtenirMorceau = (videoId: string) => fetch(`/api/morceaux/${videoId}`).then((r) => lire<Morceau>(r))

export const obtenirTablature = (videoId: string) =>
  fetch(`/api/morceaux/${videoId}/tablature`).then((r) => lire<import('./tablature').Tablature>(r))

export const urlPiste = (videoId: string, piste: 'piste-basse' | 'backing-track') =>
  `/api/morceaux/${videoId}/pistes/${piste}`

export const enregistrerTablature = async (videoId: string, tablature: import('./tablature').Tablature) => {
  const res = await fetch(`/api/morceaux/${videoId}/tablature`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(tablature),
  })
  if (!res.ok) await lire(res)
}
