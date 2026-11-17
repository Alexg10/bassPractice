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

  seekTo(ms: number) {
    this.backing.currentTime = this.basse.currentTime = ms / 1000
  }
  play() {
    this.basse.currentTime = this.backing.currentTime
    void Promise.all([this.backing.play(), this.basse.play()]).catch(() => this.pause())
  }
  pause() {
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
