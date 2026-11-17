/**
 * Prototype jetable (#9) : alphaTab peut-il afficher NOTRE tablature et suivre un audio externe ?
 *
 * La même ligne de basse de test sert à générer l'alphaTex et un audio synthétisé (notes + clic sur
 * chaque temps, avec une intro de silence). On compare la mesure attendue d'après le temps audio et
 * la mesure qu'alphaTab surligne.
 */
import * as alphaTab from '@coderline/alphatab'

// --- Modèle minimal de tablature (ce que notre app possédera) -------------------------------

/** Corde 1 = Mi grave … corde 4 = Sol. */
type Note = { string: 1 | 2 | 3 | 4; fret: number }
/** duration : 1 = ronde, 2 = blanche, 4 = noire, 8 = croche. note absente = silence. */
type Beat = { duration: 1 | 2 | 4 | 8; note?: Note }
type Bar = Beat[]
type Tab = { tempo: number; firstBarOffsetMs: number; bars: Bar[] }

const OPEN_STRING_MIDI = [28, 33, 38, 43] as const // E1 A1 D2 G2

const RIFFS: Bar[] = [
  [{ duration: 4, note: { string: 1, fret: 0 } }, { duration: 4, note: { string: 1, fret: 3 } }, { duration: 4, note: { string: 1, fret: 5 } }, { duration: 4, note: { string: 2, fret: 2 } }],
  [{ duration: 8, note: { string: 2, fret: 0 } }, { duration: 8, note: { string: 2, fret: 0 } }, { duration: 8, note: { string: 2, fret: 3 } }, { duration: 8, note: { string: 2, fret: 5 } }, { duration: 4 }, { duration: 4, note: { string: 3, fret: 2 } }],
  [{ duration: 2, note: { string: 3, fret: 0 } }, { duration: 4, note: { string: 4, fret: 2 } }, { duration: 4, note: { string: 3, fret: 3 } }],
  [{ duration: 8, note: { string: 1, fret: 7 } }, { duration: 8, note: { string: 1, fret: 5 } }, { duration: 8, note: { string: 1, fret: 3 } }, { duration: 8, note: { string: 1, fret: 0 } }, { duration: 2, note: { string: 1, fret: 0 } }],
]

function buildTab(barCount: number): Tab {
  return {
    tempo: 100,
    firstBarOffsetMs: 1500,
    bars: Array.from({ length: barCount }, (_, i) => structuredClone(RIFFS[i % RIFFS.length])),
  }
}

// --- Modèle → alphaTex ---------------------------------------------------------------------

function toAlphaTex(tab: Tab): string {
  const bars = tab.bars.map((bar) =>
    bar
      // alphaTex numérote les cordes depuis la plus aiguë : corde 4 (Sol) = 1, corde 1 (Mi) = 4.
      .map((b) => (b.note ? `${b.note.fret}.${5 - b.note.string}.${b.duration}` : `r.${b.duration}`))
      .join(' '),
  )
  return [
    `\\tempo ${tab.tempo}`,
    `\\sync 0 0 ${tab.firstBarOffsetMs}`,
    '.',
    '\\track "Basse"',
    '\\staff {tabs}',
    '\\tuning (G2 D2 A1 E1)',
    bars.join(' | '),
  ].join('\n')
}

// --- Modèle → audio de test (OfflineAudioContext → WAV) ------------------------------------

const SAMPLE_RATE = 44100
const withClicks = () => (document.getElementById('ourClicks') as HTMLInputElement).checked
const beatSeconds = (tab: Tab) => 60 / tab.tempo
const barSeconds = (tab: Tab) => 4 * beatSeconds(tab)

async function renderAudio(tab: Tab): Promise<Blob> {
  const offset = tab.firstBarOffsetMs / 1000
  const total = offset + tab.bars.length * barSeconds(tab) + 1
  const ctx = new OfflineAudioContext(1, Math.ceil(total * SAMPLE_RATE), SAMPLE_RATE)

  const pluck = (t: number, dur: number, midi: number) => {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = 440 * 2 ** ((midi - 69) / 12)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 900
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.5, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(dur, 0.05) * 0.95)
    osc.connect(lp).connect(g).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + dur)
  }
  const click = (t: number, accent: boolean) => {
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.value = accent ? 2000 : 1400
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.15, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.02)
    osc.connect(g).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.03)
  }

  tab.bars.forEach((bar, i) => {
    const barStart = offset + i * barSeconds(tab)
    if (withClicks()) for (let b = 0; b < 4; b++) click(barStart + b * beatSeconds(tab), b === 0)
    let t = barStart
    for (const beat of bar) {
      const dur = (4 / beat.duration) * beatSeconds(tab)
      if (beat.note) pluck(t, dur, OPEN_STRING_MIDI[beat.note.string - 1] + beat.note.fret)
      t += dur
    }
  })

  return toWav(await ctx.startRendering())
}

function toWav(buffer: AudioBuffer): Blob {
  const data = buffer.getChannelData(0)
  const out = new DataView(new ArrayBuffer(44 + data.length * 2))
  const str = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); out.setUint32(4, 36 + data.length * 2, true); str(8, 'WAVE')
  str(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true)
  out.setUint32(24, SAMPLE_RATE, true); out.setUint32(28, SAMPLE_RATE * 2, true)
  out.setUint16(32, 2, true); out.setUint16(34, 16, true)
  str(36, 'data'); out.setUint32(40, data.length * 2, true)
  data.forEach((v, i) => out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true))
  return new Blob([out], { type: 'audio/wav' })
}

// --- Câblage alphaTab ↔ <audio> ---------------------------------------------------------------

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const audio = $<HTMLAudioElement>('audio')
const debug = $<HTMLDivElement>('debug')
const speed = $<HTMLSelectElement>('speed')
audio.preservesPitch = true

for (let s = 50; s <= 100; s += 5) speed.add(new Option(`${s} %`, String(s / 100), s === 100, s === 100))

const api = new alphaTab.AlphaTabApi($('tab'), {
  player: {
    playerMode: alphaTab.PlayerMode.EnabledExternalMedia,
    enableCursor: true,
    enableAnimatedBeatCursor: true,
    enableUserInteraction: true,
    scrollMode: alphaTab.ScrollMode.Continuous,
  },
})

const handler: alphaTab.synth.IExternalMediaHandler = {
  get backingTrackDuration() {
    return Number.isFinite(audio.duration) ? audio.duration * 1000 : 0
  },
  get playbackRate() {
    return audio.playbackRate
  },
  set playbackRate(v) {
    audio.playbackRate = v
  },
  get masterVolume() {
    return audio.volume
  },
  set masterVolume(v) {
    audio.volume = v
  },
  seekTo(ms) {
    audio.currentTime = ms / 1000
  },
  play() {
    void audio.play()
  },
  pause() {
    audio.pause()
  },
}

const output = () => api.player!.output as alphaTab.synth.IExternalMediaSynthOutput
api.playerReady.on(() => {
  output().handler = handler
  $<HTMLButtonElement>('play').disabled = false
  $<HTMLButtonElement>('stop').disabled = false
})

// alphaTab n'écoute pas l'audio lui-même : on lui pousse la position à chaque frame.
const pushPosition = () => output().updatePosition(audio.currentTime * 1000)
const tick = () => {
  if (!audio.paused) pushPosition()
  renderDebug()
  requestAnimationFrame(tick)
}
audio.addEventListener('seeked', pushPosition)

// --- Instrumentation -------------------------------------------------------------------------

let tab = buildTab(8)
let alphaTabBar = -1
let worstDriftBars = 0
let lastRenderMs = 0
let renderStart = 0
/** Depuis quand l'écart courant est non nul : un écart sur une seule image (saut de boucle) n'est pas une dérive. */
let driftSince = 0
let episodeLogged = false
const SUSTAINED_DRIFT_MS = 150
/** Dernière action (utilisateur ou alphaTab) avant une dérive, pour savoir ce qui la déclenche. */
let lastAction = 'aucune'
let lastActionAt = 0
const driftLog: string[] = []
function action(label: string) {
  lastAction = label
  lastActionAt = audio.currentTime
}

api.playedBeatChanged.on((beat) => (alphaTabBar = beat.voice.bar.index + 1))
/** Chronomètre du changement de modèle jusqu'à la fin du rendu (alphaTab rend dans un worker). */
function texTimed(tex: string) {
  renderStart = performance.now()
  api.tex(tex)
}
api.renderFinished.on(() => {
  lastRenderMs = performance.now() - renderStart
  $<HTMLButtonElement>('edit').disabled = false
})

function expectedBar(): number {
  const t = audio.currentTime - tab.firstBarOffsetMs / 1000
  return t < 0 ? 0 : Math.min(tab.bars.length, Math.floor(t / barSeconds(tab)) + 1)
}

function renderDebug() {
  const exp = expectedBar()
  const drift = exp > 0 && alphaTabBar > 0 ? Math.abs(exp - alphaTabBar) : 0
  const now = performance.now()
  if (!drift) {
    driftSince = 0
    episodeLogged = false
  }
  else if (!driftSince) driftSince = now
  const sustained = drift && now - driftSince > SUSTAINED_DRIFT_MS
  if (!audio.paused && sustained) {
    // Une entrée par épisode de dérive : au moment où il devient « durable ».
    if (!episodeLogged) {
      episodeLogged = true
      driftLog.unshift(
        `t=${audio.currentTime.toFixed(2)}s attendue ${exp} / alphaTab ${alphaTabBar} (écart ${drift}) — dernière action : ${lastAction} à t=${lastActionAt.toFixed(2)}s, vitesse ${audio.playbackRate}`,
      )
      driftLog.length = Math.min(driftLog.length, 5)
    }
    worstDriftBars = Math.max(worstDriftBars, drift)
  }
  const range = api.playbackRange
  debug.innerHTML = [
    `temps audio        : ${audio.currentTime.toFixed(2)} s  (vitesse ${audio.playbackRate}, preservesPitch ${audio.preservesPitch})`,
    `mesure attendue    : ${exp || '— (intro)'}`,
    `mesure alphaTab    : ${alphaTabBar > 0 ? alphaTabBar : '—'}`,
    `écart              : <span class="${drift ? 'bad' : ''}">${drift}</span>   (pire écart durable > 150 ms : <span class="${worstDriftBars ? 'bad' : ''}">${worstDriftBars}</span>)`,
    `boucle             : ${api.isLooping ? 'oui' : 'non'}  plage ${range ? `${range.startTick}→${range.endTick} ticks` : 'aucune'}`,
    `dernier rendu      : ${lastRenderMs.toFixed(0)} ms  (${tab.bars.length} mesures)`,
    `métronome alphaTab : ${api.metronomeVolume}   décompte alphaTab : ${api.countInVolume}`,
    `dérives durables   :`,
    ...(driftLog.length ? driftLog.map((l) => `  ${l}`) : ['  aucune']),
  ].join('\n')
}

// --- Contrôles -------------------------------------------------------------------------------

async function load(barCount: number) {
  api.stop()
  tab = buildTab(barCount)
  debug.textContent = "Génération de l'audio…"
  const url = URL.createObjectURL(await renderAudio(tab))
  if (audio.src) URL.revokeObjectURL(audio.src)
  audio.src = url
  await new Promise((r) => audio.addEventListener('loadedmetadata', r, { once: true }))
  worstDriftBars = 0
  driftLog.length = 0
  texTimed(toAlphaTex(tab))
}

$('play').addEventListener('click', () => {
  action('lecture/pause')
  api.playPause()
})
$('stop').addEventListener('click', () => {
  action('stop')
  api.stop()
  worstDriftBars = 0
  driftLog.length = 0
})
speed.addEventListener('change', () => {
  action(`vitesse ${speed.value}`)
  api.playbackSpeed = Number(speed.value)
})
$<HTMLInputElement>('loop').addEventListener('change', (e) => {
  action('boucle on/off')
  api.isLooping = (e.target as HTMLInputElement).checked
})
$<HTMLInputElement>('atClicks').addEventListener('change', (e) => {
  const on = (e.target as HTMLInputElement).checked
  api.metronomeVolume = on ? 1 : 0
  api.countInVolume = on ? 1 : 0
})
$<HTMLInputElement>('ourClicks').addEventListener('change', () => void load(tab.bars.length))
audio.addEventListener('seeking', () => action('saut audio (clic sur la tab ou bouclage)'))
$<HTMLSelectElement>('length').addEventListener('change', (e) => void load(Number((e.target as HTMLSelectElement).value)))
$('edit').addEventListener('click', () => {
  action('modifier une note')
  // Simule une édition : change une frette du modèle puis re-rend tout (l'audio ne change pas).
  const bar = tab.bars[Math.floor(Math.random() * tab.bars.length)]
  const beat = bar.find((b) => b.note)
  if (beat?.note) beat.note.fret = (beat.note.fret + 1) % 12
  texTimed(toAlphaTex(tab))
})

void load(8)
requestAnimationFrame(tick)
