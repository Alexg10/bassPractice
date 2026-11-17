import { describe, expect, it } from 'vitest'
import {
  changerCorde,
  changerDuree,
  deplacer,
  deplacerCurseur,
  saisirFrette,
  supprimer,
  type Curseur,
} from './edition'
import type { Evenement, Tablature } from './tablature'

const n = (corde: 1 | 2 | 3 | 4, frette: number, duree: number): Evenement => ({
  type: 'note',
  hauteur: [28, 33, 38, 43][corde - 1] + frette,
  duree,
  position: { corde, frette },
})
const s = (duree: number): Evenement => ({ type: 'silence', duree })

const tab = (...mesures: Evenement[][]): Tablature => ({
  grille: { tempo: 100, premiere_mesure_s: 0.5, signature: [4, 4] },
  mesures: mesures.map((evenements) => ({ evenements })),
})
const ev = (t: Tablature, c: Curseur) => t.mesures[c.mesure].evenements[c.evenement]
const resume = (t: Tablature, m = 0) =>
  t.mesures[m].evenements.map((e) => (e.type === 'note' ? `${e.position ? `${e.position.corde}.${e.position.frette}` : `HM${e.hauteur}`}/${e.duree}` : `r/${e.duree}`)).join(' ')
const C = (mesure: number, evenement: number): Curseur => ({ mesure, evenement })

describe('saisirFrette', () => {
  it('change la frette d’une note sur sa corde, et donc sa hauteur', () => {
    const t = saisirFrette(tab([n(2, 3, 16)]), C(0, 0), 5, 1)
    expect(ev(t, C(0, 0))).toEqual({ type: 'note', hauteur: 38, duree: 16, position: { corde: 2, frette: 5 } })
  })

  it('transforme un silence en note de même durée, sur la corde courante', () => {
    const t = saisirFrette(tab([s(4), s(4), s(8)]), C(0, 1), 7, 3)
    expect(resume(t)).toBe('r/4 3.7/4 r/8')
  })

  it('refuse une frette hors du manche', () => {
    const t0 = tab([n(1, 0, 16)])
    expect(saisirFrette(t0, C(0, 0), 21, 1)).toBe(t0)
  })

  it('donne une position à une note hors manche', () => {
    const t = saisirFrette(tab([{ type: 'note', hauteur: 26, duree: 16, position: null }]), C(0, 0), 2, 1)
    expect(resume(t)).toBe('1.2/16')
  })

  it('ne modifie pas la tablature d’origine', () => {
    const t0 = tab([n(1, 0, 16)])
    saisirFrette(t0, C(0, 0), 3, 1)
    expect(resume(t0)).toBe('1.0/16')
  })
})

describe('changerCorde', () => {
  it('passe à la corde voisine en gardant la même hauteur', () => {
    // La1 (33) : Mi case 5 → La à vide.
    expect(resume(changerCorde(tab([n(1, 5, 16)]), C(0, 0), +1))).toBe('2.0/16')
    expect(resume(changerCorde(tab([n(2, 0, 16)]), C(0, 0), -1))).toBe('1.5/16')
  })

  it('ne fait rien si la note n’est pas jouable sur la corde voisine', () => {
    const t0 = tab([n(1, 2, 16)]) // Fa#1 : impossible sur la corde de La
    expect(changerCorde(t0, C(0, 0), +1)).toBe(t0)
  })

  it('ne fait rien sur un silence ou au bord du manche', () => {
    const t1 = tab([s(16)])
    expect(changerCorde(t1, C(0, 0), +1)).toBe(t1)
    const t2 = tab([n(4, 5, 16)])
    expect(changerCorde(t2, C(0, 0), +1)).toBe(t2)
  })
})

describe('changerDuree', () => {
  it('allonge une note en prenant la place du silence qui suit', () => {
    expect(resume(changerDuree(tab([n(1, 0, 4), s(4), s(8)]), C(0, 0), +1))).toBe('1.0/6 r/2 r/8')
  })

  it('n’allonge pas une note qui n’a pas de silence assez long après elle', () => {
    const t0 = tab([n(1, 0, 4), n(1, 3, 12)])
    expect(changerDuree(t0, C(0, 0), +1)).toBe(t0)
  })

  it('raccourcit une note et complète par un silence', () => {
    expect(resume(changerDuree(tab([n(1, 0, 8), s(8)]), C(0, 0), -1))).toBe('1.0/6 r/2 r/8')
  })

  it('ne raccourcit pas en dessous de la double croche', () => {
    const t0 = tab([n(1, 0, 1), s(1), s(2), s(4), s(8)])
    expect(changerDuree(t0, C(0, 0), -1)).toBe(t0)
  })
})

describe('supprimer', () => {
  it('remplace la note par un silence et regroupe les silences sur les temps', () => {
    expect(resume(supprimer(tab([n(1, 0, 4), n(1, 3, 4), s(8)]), C(0, 1)))).toBe('1.0/4 r/4 r/8')
    expect(resume(supprimer(tab([n(1, 0, 2), n(1, 3, 2), s(4), s(8)]), C(0, 1)))).toBe('1.0/2 r/2 r/4 r/8')
  })
})

describe('deplacer', () => {
  it('échange l’événement avec son voisin dans la mesure', () => {
    expect(resume(deplacer(tab([n(1, 0, 4), s(4), s(8)]), C(0, 0), +1))).toBe('r/4 1.0/4 r/8')
  })

  it('ne sort pas de la mesure', () => {
    const t0 = tab([n(1, 0, 16)])
    expect(deplacer(t0, C(0, 0), -1)).toBe(t0)
  })
})

describe('deplacerCurseur', () => {
  const t = tab([n(1, 0, 8), s(8)], [s(16)], [n(1, 0, 16)])
  it('avance et recule d’un événement, en passant d’une mesure à l’autre', () => {
    expect(deplacerCurseur(t, C(0, 1), +1)).toEqual(C(1, 0))
    expect(deplacerCurseur(t, C(1, 0), -1)).toEqual(C(0, 1))
  })
  it('s’arrête aux extrémités', () => {
    expect(deplacerCurseur(t, C(0, 0), -1)).toEqual(C(0, 0))
    expect(deplacerCurseur(t, C(2, 0), +1)).toEqual(C(2, 0))
  })
})
