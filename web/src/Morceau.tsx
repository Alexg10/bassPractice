import * as alphaTab from '@coderline/alphatab'
import { useEffect, useRef, useState } from 'react'
import { obtenirMorceau, obtenirTablature, urlPiste, type Morceau as MorceauApi } from './api'
import { LecteurPistes } from './lecteurPistes'
import { Metronome } from './metronome'
import { notesHorsManche, versAlphaTex, type Tablature } from './tablature'

const VITESSES = Array.from({ length: 11 }, (_, i) => 50 + i * 5)

type Reglages = { vitesse: number; boucle: boolean; decompte: boolean; metronome: boolean; volumeBacking: number; volumeBasse: number }
const REGLAGES_INITIAUX: Reglages = { vitesse: 100, boucle: false, decompte: true, metronome: false, volumeBacking: 100, volumeBasse: 100 }

export function Morceau({ videoId }: { videoId: string }) {
  const conteneur = useRef<HTMLDivElement>(null)
  const [morceau, setMorceau] = useState<MorceauApi | null>(null)
  const [tablature, setTablature] = useState<Tablature | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [pret, setPret] = useState(false)
  const [enLecture, setEnLecture] = useState(false)
  const [plage, setPlage] = useState<string | null>(null)
  const [reglages, setReglages] = useState(REGLAGES_INITIAUX)
  const reglagesRef = useRef(reglages)
  reglagesRef.current = reglages
  const api = useRef<alphaTab.AlphaTabApi | null>(null)
  const lecteurRef = useRef<LecteurPistes | null>(null)

  useEffect(() => {
    Promise.all([obtenirMorceau(videoId), obtenirTablature(videoId)])
      .then(([m, t]) => {
        setMorceau(m)
        setTablature(t)
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : String(e)))
  }, [videoId])

  useEffect(() => {
    if (!tablature || !conteneur.current) return
    const grille = tablature.grille
    const lecteur = new LecteurPistes(urlPiste(videoId, 'backing-track'), urlPiste(videoId, 'piste-basse'))
    const metronome = new Metronome()
    lecteurRef.current = lecteur
    const at = new alphaTab.AlphaTabApi(conteneur.current, {
      player: {
        playerMode: alphaTab.PlayerMode.EnabledExternalMedia,
        enableCursor: true,
        enableAnimatedBeatCursor: true,
        enableUserInteraction: true,
        scrollMode: alphaTab.ScrollMode.Continuous,
      },
    })
    api.current = at
    if (import.meta.env.DEV) Object.assign(window, { __bassPractice: { lecteur, at, metronome } })
    const sortie = () => at.player!.output as alphaTab.synth.IExternalMediaSynthOutput

    // Décompte d'une mesure avant chaque passage de la boucle (premier passage compris).
    lecteur.avantLecture = () => {
      const r = reglagesRef.current
      return r.boucle && r.decompte && at.playbackRange ? metronome.decompte(grille, r.vitesse / 100) : null
    }

    at.playerReady.on(() => {
      sortie().handler = lecteur
      setPret(true)
    })
    at.playerStateChanged.on((e) => setEnLecture(e.state === alphaTab.synth.PlayerState.Playing))
    at.playbackRangeChanged.on((e) => {
      const range = e.playbackRange
      if (!range) return setPlage(null)
      const ticksParMesure = at.score!.masterBars[0].calculateDuration()
      const de = Math.floor(range.startTick / ticksParMesure) + 1
      const a = Math.ceil(range.endTick / ticksParMesure)
      setPlage(de === a ? `mesure ${de}` : `mesures ${de} à ${a}`)
    })

    // alphaTab ne lit pas l'audio lui-même : on lui pousse la position à chaque image.
    let image = 0
    let precedent = 0
    const suivre = () => {
      if (lecteur.enLecture) {
        const t = lecteur.tempsS
        lecteur.recaler()
        sortie().updatePosition(t * 1000)
        if (t < precedent || t - precedent > 0.5) metronome.reinitialiser() // saut ou retour de boucle
        if (reglagesRef.current.metronome) metronome.suivre(grille, t, reglagesRef.current.vitesse / 100)
        precedent = t
      } else metronome.reinitialiser()
      image = requestAnimationFrame(suivre)
    }
    image = requestAnimationFrame(suivre)
    lecteur.backing.addEventListener('ended', () => at.stop())
    at.tex(versAlphaTex(tablature))

    return () => {
      cancelAnimationFrame(image)
      lecteur.detruire()
      at.destroy()
      api.current = null
      lecteurRef.current = null
      setPret(false)
    }
  }, [tablature, videoId])

  // Applique les réglages au lecteur et à alphaTab.
  useEffect(() => {
    const at = api.current
    const lecteur = lecteurRef.current
    if (!pret || !at || !lecteur) return
    at.playbackSpeed = reglages.vitesse / 100
    at.isLooping = reglages.boucle
    lecteur.volumeBacking = reglages.volumeBacking / 100
    lecteur.volumeBasse = reglages.volumeBasse / 100
  }, [reglages, pret])

  const regler = <K extends keyof Reglages>(cle: K, valeur: Reglages[K]) => setReglages((r) => ({ ...r, [cle]: valeur }))

  if (erreur) return <p className="erreur">{erreur}</p>
  if (!morceau || !tablature) return <p className="vide">Chargement…</p>

  const horsManche = notesHorsManche(tablature)
  return (
    <section className="morceau">
      <h2>{morceau.titre ?? videoId}</h2>
      <div className="barre-lecture">
        <button disabled={!pret} onClick={() => api.current?.playPause()} aria-label={enLecture ? 'Pause' : 'Lecture'}>
          {enLecture ? '❚❚' : '▶︎'}
        </button>
        <button disabled={!pret} onClick={() => api.current?.stop()} aria-label="Retour au début">
          ■
        </button>
        <label>
          Vitesse{' '}
          <select value={reglages.vitesse} onChange={(e) => regler('vitesse', Number(e.target.value))}>
            {VITESSES.map((v) => (
              <option key={v} value={v}>
                {v} %
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={reglages.boucle} onChange={(e) => regler('boucle', e.target.checked)} /> Boucle
        </label>
        <label>
          <input type="checkbox" checked={reglages.decompte} onChange={(e) => regler('decompte', e.target.checked)} />{' '}
          Décompte
        </label>
        <label>
          <input type="checkbox" checked={reglages.metronome} onChange={(e) => regler('metronome', e.target.checked)} />{' '}
          Métronome
        </label>
      </div>
      <div className="barre-lecture mixeur">
        <label>
          Backing track
          <input type="range" min={0} max={100} value={reglages.volumeBacking} onChange={(e) => regler('volumeBacking', Number(e.target.value))} />
        </label>
        <label>
          Basse
          <input type="range" min={0} max={100} value={reglages.volumeBasse} onChange={(e) => regler('volumeBasse', Number(e.target.value))} />
        </label>
      </div>
      <p className="meta">
        {Math.round(tablature.grille.tempo)} BPM · {tablature.mesures.length} mesures
        {horsManche > 0 && <span className="etat echec"> · {horsManche} note(s) hors manche</span>}
        {' · '}
        {plage
          ? `Sélection : ${plage}${reglages.boucle ? ' (en boucle)' : ''}`
          : 'Clique sur une mesure pour y placer la lecture, glisse sur plusieurs mesures pour choisir la boucle.'}
      </p>
      <div ref={conteneur} className="tablature" />
    </section>
  )
}
