import type { GrilleRythmique } from './tablature'

export type Clic = { temps_s: number; accent: boolean }

/** Les temps de la grille rythmique dans [de_s, a_s[, temps de l'audio ; accent sur le 1er temps de chaque mesure. */
export function clicsEntre(grille: GrilleRythmique, de_s: number, a_s: number): Clic[] {
  const periode = 60 / grille.tempo
  const parMesure = grille.signature[0]
  const premier = Math.ceil((Math.max(de_s, 0) - grille.premiere_mesure_s) / periode - 1e-9)
  const clics: Clic[] = []
  for (let k = premier; ; k++) {
    const t = grille.premiere_mesure_s + k * periode
    if (t >= a_s - 1e-9) break
    if (t >= 0) clics.push({ temps_s: Math.round(t * 1e6) / 1e6, accent: ((k % parMesure) + parMesure) % parMesure === 0 })
  }
  return clics
}

/** Avance avec laquelle on programme les clics (le suivi tourne à chaque image, ~16 ms). */
const HORIZON_S = 0.15

/** Joue des clics calés sur la grille rythmique, avec l'horloge audio du navigateur. */
export class Metronome {
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private programmeJusqua: number | null = null
  volume = 0.6

  private contexte() {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.gain = this.ctx.createGain()
      this.gain.connect(this.ctx.destination)
    }
    void this.ctx.resume()
    this.gain!.gain.value = this.volume
    return this.ctx
  }

  private clic(quand: number, accent: boolean) {
    const ctx = this.contexte()
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.frequency.value = accent ? 1760 : 1320
    env.gain.setValueAtTime(0.0001, quand)
    env.gain.exponentialRampToValueAtTime(1, quand + 0.002)
    env.gain.exponentialRampToValueAtTime(0.0001, quand + 0.05)
    osc.connect(env).connect(this.gain!)
    osc.start(quand)
    osc.stop(quand + 0.06)
  }

  /** À appeler à chaque image pendant la lecture : programme les clics des prochaines ~150 ms. */
  suivre(grille: GrilleRythmique, tempsAudio_s: number, vitesse: number) {
    const ctx = this.contexte()
    const de = this.programmeJusqua ?? tempsAudio_s
    const a = tempsAudio_s + HORIZON_S * vitesse
    for (const c of clicsEntre(grille, de, a)) {
      this.clic(ctx.currentTime + Math.max(0, (c.temps_s - tempsAudio_s) / vitesse), c.accent)
    }
    this.programmeJusqua = Math.max(de, a)
  }

  /** Après un saut ou une pause : on reprogrammera à partir de la nouvelle position. */
  reinitialiser() {
    this.programmeJusqua = null
  }

  /** Une mesure de clics au tempo de la grille (ralenti selon la vitesse). Résout à la fin de la mesure. */
  decompte(grille: GrilleRythmique, vitesse: number): Promise<void> {
    const ctx = this.contexte()
    const periode = 60 / grille.tempo / vitesse
    const parMesure = grille.signature[0]
    const debut = ctx.currentTime + 0.05
    for (let i = 0; i < parMesure; i++) this.clic(debut + i * periode, i === 0)
    return new Promise((r) => setTimeout(r, (0.05 + parMesure * periode) * 1000))
  }
}
