import { describe, expect, it } from 'vitest'
import { clicsEntre } from './metronome'

// 120 BPM : un temps = 0,5 s. Mesure 1 à 1 s.
const grille = { tempo: 120, premiere_mesure_s: 1, signature: [4, 4] as [number, number] }

describe('clicsEntre', () => {
  it('donne un clic par temps, accentué sur le premier temps de chaque mesure', () => {
    expect(clicsEntre(grille, 1, 3.2)).toEqual([
      { temps_s: 1, accent: true },
      { temps_s: 1.5, accent: false },
      { temps_s: 2, accent: false },
      { temps_s: 2.5, accent: false },
      { temps_s: 3, accent: true },
    ])
  })

  it('exclut la borne de fin', () => {
    expect(clicsEntre(grille, 1, 2).map((c) => c.temps_s)).toEqual([1, 1.5])
  })

  it('compte aussi les temps de l’intro, avant la mesure 1, sans temps négatif', () => {
    expect(clicsEntre(grille, 0, 1.1)).toEqual([
      { temps_s: 0, accent: false },
      { temps_s: 0.5, accent: false },
      { temps_s: 1, accent: true },
    ])
  })

  it('ne renvoie rien sur un intervalle vide', () => {
    expect(clicsEntre(grille, 2, 2)).toEqual([])
  })
})
