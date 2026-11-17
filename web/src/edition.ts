/**
 * Opérations d'édition de la tablature. Pures : elles renvoient une nouvelle tablature (ou la même
 * si l'opération est impossible) et gardent chaque mesure à 16 doubles croches.
 */
import type { Evenement, Mesure, Note, Tablature } from './tablature'

export type Curseur = { mesure: number; evenement: number }

const ACCORDAGE_MIDI = [28, 33, 38, 43]
export const FRETTE_MAX = 20
const DUREES = [1, 2, 3, 4, 6, 8, 12, 16]
const DUREES_DE_SILENCE = [16, 8, 4, 2, 1]
const PAR_MESURE = 16

type Corde = 1 | 2 | 3 | 4

function remplacerMesure(tab: Tablature, index: number, evenements: Evenement[]): Tablature {
  const mesures = tab.mesures.slice()
  mesures[index] = { evenements: normaliserSilences(evenements) }
  return { ...tab, mesures }
}

const debutDe = (m: Mesure, i: number) => m.evenements.slice(0, i).reduce((d, e) => d + e.duree, 0)

/** Regroupe les silences consécutifs puis les redécoupe sur les temps (comme la transcription). */
function normaliserSilences(evenements: Evenement[]): Evenement[] {
  const resultat: Evenement[] = []
  let p = 0
  let i = 0
  while (i < evenements.length) {
    const e = evenements[i]
    if (e.type === 'note') {
      resultat.push(e)
      p += e.duree
      i++
      continue
    }
    let fin = p
    while (i < evenements.length && evenements[i].type === 'silence') fin += evenements[i++].duree
    while (p < fin) {
      const d = DUREES_DE_SILENCE.find((d) => d <= fin - p && p % d === 0)!
      resultat.push({ type: 'silence', duree: d })
      p += d
    }
  }
  return resultat
}

export function saisirFrette(tab: Tablature, c: Curseur, frette: number, cordeCourante: Corde): Tablature {
  if (frette < 0 || frette > FRETTE_MAX) return tab
  const e = tab.mesures[c.mesure].evenements[c.evenement]
  const corde = (e.type === 'note' && e.position?.corde) || cordeCourante
  const note: Note = { type: 'note', hauteur: ACCORDAGE_MIDI[corde - 1] + frette, duree: e.duree, position: { corde, frette } }
  const evenements = tab.mesures[c.mesure].evenements.slice()
  evenements[c.evenement] = note
  return remplacerMesure(tab, c.mesure, evenements)
}

export function changerCorde(tab: Tablature, c: Curseur, delta: 1 | -1): Tablature {
  const e = tab.mesures[c.mesure].evenements[c.evenement]
  if (e.type !== 'note' || !e.position) return tab
  const corde = e.position.corde + delta
  if (corde < 1 || corde > 4) return tab
  const frette = e.hauteur - ACCORDAGE_MIDI[corde - 1]
  if (frette < 0 || frette > FRETTE_MAX) return tab
  const evenements = tab.mesures[c.mesure].evenements.slice()
  evenements[c.evenement] = { ...e, position: { corde: corde as Corde, frette } }
  return remplacerMesure(tab, c.mesure, evenements)
}

export function changerDuree(tab: Tablature, c: Curseur, sens: 1 | -1): Tablature {
  const mesure = tab.mesures[c.mesure]
  const e = mesure.evenements[c.evenement]
  const nouvelle = DUREES[DUREES.indexOf(e.duree) + sens]
  if (nouvelle === undefined) return tab
  const evenements = mesure.evenements.slice()

  if (sens < 0) {
    evenements.splice(c.evenement, 1, { ...e, duree: nouvelle }, { type: 'silence', duree: e.duree - nouvelle })
    return remplacerMesure(tab, c.mesure, evenements)
  }
  // Allonger : on prend la place des silences qui suivent, jamais d'une note.
  let manque = nouvelle - e.duree
  let j = c.evenement + 1
  let libere = 0
  while (libere < manque && j < evenements.length && evenements[j].type === 'silence') libere += evenements[j++].duree
  if (libere < manque || debutDe(mesure, c.evenement) + nouvelle > PAR_MESURE) return tab
  const reste: Evenement[] = libere > manque ? [{ type: 'silence', duree: libere - manque }] : []
  evenements.splice(c.evenement, j - c.evenement, { ...e, duree: nouvelle }, ...reste)
  return remplacerMesure(tab, c.mesure, evenements)
}

export function supprimer(tab: Tablature, c: Curseur): Tablature {
  const e = tab.mesures[c.mesure].evenements[c.evenement]
  if (e.type === 'silence') return tab
  const evenements = tab.mesures[c.mesure].evenements.slice()
  evenements[c.evenement] = { type: 'silence', duree: e.duree }
  return remplacerMesure(tab, c.mesure, evenements)
}

export function deplacer(tab: Tablature, c: Curseur, sens: 1 | -1): Tablature {
  const evenements = tab.mesures[c.mesure].evenements.slice()
  const voisin = c.evenement + sens
  if (voisin < 0 || voisin >= evenements.length) return tab
  ;[evenements[c.evenement], evenements[voisin]] = [evenements[voisin], evenements[c.evenement]]
  // Pas de normalisation ici : le curseur doit pouvoir suivre l'événement déplacé.
  const mesures = tab.mesures.slice()
  mesures[c.mesure] = { evenements }
  return { ...tab, mesures }
}

export function deplacerCurseur(tab: Tablature, c: Curseur, sens: 1 | -1): Curseur {
  const n = tab.mesures[c.mesure].evenements.length
  if (sens > 0) {
    if (c.evenement + 1 < n) return { ...c, evenement: c.evenement + 1 }
    return c.mesure + 1 < tab.mesures.length ? { mesure: c.mesure + 1, evenement: 0 } : c
  }
  if (c.evenement > 0) return { ...c, evenement: c.evenement - 1 }
  return c.mesure > 0 ? { mesure: c.mesure - 1, evenement: tab.mesures[c.mesure - 1].evenements.length - 1 } : c
}

/** Garde le curseur dans la mesure après une opération qui a changé le nombre d'événements. */
export function borner(tab: Tablature, c: Curseur): Curseur {
  const n = tab.mesures[c.mesure].evenements.length
  return { ...c, evenement: Math.min(c.evenement, n - 1) }
}
