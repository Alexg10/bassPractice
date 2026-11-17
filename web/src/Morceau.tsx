import * as alphaTab from '@coderline/alphatab'
import { useEffect, useRef, useState } from 'react'
import { obtenirMorceau, obtenirTablature, urlPiste, type Morceau as MorceauApi } from './api'
import { LecteurPistes } from './lecteurPistes'
import { notesHorsManche, versAlphaTex, type Tablature } from './tablature'

export function Morceau({ videoId }: { videoId: string }) {
  const conteneur = useRef<HTMLDivElement>(null)
  const [morceau, setMorceau] = useState<MorceauApi | null>(null)
  const [tablature, setTablature] = useState<Tablature | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [pret, setPret] = useState(false)
  const [enLecture, setEnLecture] = useState(false)
  const api = useRef<alphaTab.AlphaTabApi | null>(null)

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
    const lecteur = new LecteurPistes(urlPiste(videoId, 'backing-track'), urlPiste(videoId, 'piste-basse'))
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
    if (import.meta.env.DEV) Object.assign(window, { __bassPractice: { lecteur, at } })
    const sortie = () => at.player!.output as alphaTab.synth.IExternalMediaSynthOutput

    at.playerReady.on(() => {
      sortie().handler = lecteur
      setPret(true)
    })
    at.playerStateChanged.on((e) => setEnLecture(e.state === alphaTab.synth.PlayerState.Playing))
    // alphaTab ne lit pas l'audio lui-même : on lui pousse la position à chaque image.
    let image = 0
    const suivre = () => {
      if (lecteur.enLecture) {
        lecteur.recaler()
        sortie().updatePosition(lecteur.tempsS * 1000)
      }
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
      setPret(false)
    }
  }, [tablature, videoId])

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
        <span className="meta">
          {Math.round(tablature.grille.tempo)} BPM · {tablature.mesures.length} mesures
          {horsManche > 0 && <span className="etat echec"> · {horsManche} note(s) hors manche</span>}
        </span>
      </div>
      <p className="meta">Clique sur une mesure pour y placer la lecture.</p>
      <div ref={conteneur} className="tablature" />
    </section>
  )
}
