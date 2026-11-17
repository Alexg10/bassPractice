import { describe, expect, it } from 'vitest'
import { nomNote, versAlphaTex, type Tablature } from './tablature'

const tab = (evenements: Tablature['mesures'][number]['evenements']): Tablature => ({
  grille: { tempo: 101.43, premiere_mesure_s: 0.78, signature: [4, 4] },
  mesures: [{ evenements }],
})

const corps = (t: Tablature) => versAlphaTex(t).split('\n').at(-1)

describe('versAlphaTex', () => {
  it('reporte le tempo et le début de la mesure 1 dans l’audio', () => {
    const tex = versAlphaTex(tab([{ type: 'silence', duree: 16 }]))
    expect(tex).toContain('\\tempo 101.43')
    expect(tex).toContain('\\sync 0 0 780')
  })

  it('numérote les cordes depuis la plus aiguë, comme alphaTex', () => {
    const t = tab([
      { type: 'note', hauteur: 28, duree: 4, position: { corde: 1, frette: 0 } },
      { type: 'note', hauteur: 45, duree: 4, position: { corde: 4, frette: 2 } },
      { type: 'silence', duree: 8 },
    ])
    expect(corps(t)).toBe('0.4.4 2.1.4 r.2')
  })

  it('écrit les durées pointées', () => {
    const t = tab([
      { type: 'note', hauteur: 28, duree: 6, position: { corde: 1, frette: 0 } },
      { type: 'note', hauteur: 28, duree: 2, position: { corde: 1, frette: 0 } },
      { type: 'note', hauteur: 28, duree: 3, position: { corde: 1, frette: 0 } },
      { type: 'silence', duree: 1 },
      { type: 'silence', duree: 4 },
    ])
    expect(corps(t)).toBe('0.4.4{d} 0.4.8 0.4.8{d} r.16 r.4')
  })

  it('signale une note hors manche par une note étouffée et son nom', () => {
    expect(corps(tab([{ type: 'note', hauteur: 26, duree: 16, position: null }]))).toBe(
      'x.4.1{txt "Ré1 hors manche"}',
    )
    expect(corps(tab([{ type: 'note', hauteur: 26, duree: 12, position: null }, { type: 'silence', duree: 4 }]))).toBe(
      'x.4.2{d txt "Ré1 hors manche"} r.4',
    )
  })

  it('sépare les mesures par des barres', () => {
    const t: Tablature = { ...tab([{ type: 'silence', duree: 16 }]), mesures: [{ evenements: [{ type: 'silence', duree: 16 }] }, { evenements: [{ type: 'silence', duree: 16 }] }] }
    expect(corps(t)).toBe('r.1 | r.1')
  })
})

describe('nomNote', () => {
  it('nomme les notes en solfège français', () => {
    expect(nomNote(28)).toBe('Mi1')
    expect(nomNote(43)).toBe('Sol2')
    expect(nomNote(37)).toBe('Do#2')
  })
})
