/** Modèle de tablature, tel que renvoyé par le serveur (voir server/app/tablature.py). */

export type Position = { corde: 1 | 2 | 3 | 4; frette: number }
export type Note = { type: 'note'; hauteur: number; duree: number; position: Position | null }
export type Silence = { type: 'silence'; duree: number }
export type Evenement = Note | Silence
export type Mesure = { evenements: Evenement[] }
export type GrilleRythmique = { tempo: number; premiere_mesure_s: number; signature: [number, number] }
export type Tablature = { grille: GrilleRythmique; mesures: Mesure[] }

/** Durée en doubles croches → valeur de note alphaTex (+ pointée). */
const DUREES: Record<number, [number, boolean]> = {
  16: [1, false],
  12: [2, true],
  8: [2, false],
  6: [4, true],
  4: [4, false],
  3: [8, true],
  2: [8, false],
  1: [16, false],
}

const NOMS = ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si']
export const nomNote = (midi: number) => `${NOMS[midi % 12]}${Math.floor(midi / 12) - 1}`

function duree(d: number) {
  const [valeur, pointee] = DUREES[d]
  return pointee ? `${valeur}{d}` : `${valeur}`
}

function evenement(e: Evenement): string {
  if (e.type === 'silence') return `r.${duree(e.duree)}`
  // alphaTex numérote les cordes depuis la plus aiguë : notre corde 4 (Sol) = 1, corde 1 (Mi) = 4.
  if (e.position) return `${e.position.frette}.${5 - e.position.corde}.${duree(e.duree)}`
  // Note hors manche : signalée (note étouffée + son nom), jamais cachée.
  const d = duree(e.duree)
  const effets = `txt "${nomNote(e.hauteur)} hors manche"`
  return `x.4.${d.includes('{') ? d.replace('}', ` ${effets}}`) : `${d}{${effets}}`}`
}

export function versAlphaTex(tab: Tablature): string {
  return [
    `\\tempo ${tab.grille.tempo}`,
    `\\sync 0 0 ${Math.round(tab.grille.premiere_mesure_s * 1000)}`,
    '.',
    '\\track "Basse"',
    '\\staff {tabs}',
    '\\tuning (G2 D2 A1 E1)',
    tab.mesures.map((m) => m.evenements.map(evenement).join(' ')).join(' | '),
  ].join('\n')
}

export const notesHorsManche = (tab: Tablature) =>
  tab.mesures.flatMap((m) => m.evenements).filter((e): e is Note => e.type === 'note' && !e.position).length
