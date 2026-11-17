import type * as alphaTab from '@coderline/alphatab'

/** Écart toléré entre la piste basse et la backing track avant de recaler la basse. */
const ECART_MAX_S = 0.04

/**
 * Joue la backing track et la piste basse ensemble, pour alphaTab (mode média externe).
 * La backing track sert d'horloge ; la piste basse est recalée sur elle si elle s'en écarte.
 */
export class LecteurPistes implements alphaTab.synth.IExternalMediaHandler {
  readonly backing: HTMLAudioElement
  readonly basse: HTMLAudioElement
  /**
   * Appelé avant chaque départ de lecture et chaque saut pendant la lecture (dont le retour au début de la
   * boucle). S'il renvoie une promesse (décompte), l'audio attend qu'elle soit résolue.
   */
  avantLecture: () => Promise<void> | null = () => null
  /** Change à chaque pause : un décompte en cours ne relance pas l'audio si on a mis en pause entre-temps. */
  private generation = 0
  private enDecompte = false

  constructor(urlBacking: string, urlBasse: string) {
    this.backing = new Audio(urlBacking)
    this.basse = new Audio(urlBasse)
    for (const a of [this.backing, this.basse]) {
      a.preload = 'auto'
      a.preservesPitch = true
    }
  }

  get backingTrackDuration() {
    return Number.isFinite(this.backing.duration) ? this.backing.duration * 1000 : 0
  }
  get playbackRate() {
    return this.backing.playbackRate
  }
  set playbackRate(v: number) {
    this.backing.playbackRate = this.basse.playbackRate = v
  }
  get masterVolume() {
    return 1
  }
  set masterVolume(_: number) {}

  get tempsS() {
    return this.backing.currentTime
  }
  get enLecture() {
    return !this.backing.paused
  }
  get decompteEnCours() {
    return this.enDecompte
  }

  get volumeBacking() {
    return this.backing.volume
  }
  set volumeBacking(v: number) {
    this.backing.volume = v
  }
  get volumeBasse() {
    return this.basse.volume
  }
  set volumeBasse(v: number) {
    this.basse.volume = v
  }

  seekTo(ms: number) {
    const reprendre = this.enLecture
    this.backing.currentTime = this.basse.currentTime = ms / 1000
    if (!reprendre) return
    const attente = this.avantLecture()
    if (attente) {
      this.mettreEnPauseAudio()
      this.demarrer(attente)
    }
  }
  play() {
    this.demarrer(this.avantLecture())
  }
  private demarrer(attente: Promise<void> | null) {
    const generation = this.generation
    const lancer = () => {
      this.enDecompte = false
      if (generation !== this.generation) return
      this.basse.currentTime = this.backing.currentTime
      void Promise.all([this.backing.play(), this.basse.play()]).catch(() => this.pause())
    }
    if (attente) {
      this.enDecompte = true
      void attente.then(lancer)
    } else lancer()
  }
  pause() {
    this.generation++
    this.enDecompte = false
    this.mettreEnPauseAudio()
  }
  private mettreEnPauseAudio() {
    this.backing.pause()
    this.basse.pause()
  }

  /** À appeler régulièrement pendant la lecture. */
  recaler() {
    if (this.enLecture && Math.abs(this.basse.currentTime - this.backing.currentTime) > ECART_MAX_S) {
      this.basse.currentTime = this.backing.currentTime
    }
  }

  detruire() {
    this.pause()
    this.backing.removeAttribute('src')
    this.basse.removeAttribute('src')
  }
}
