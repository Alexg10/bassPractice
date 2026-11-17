import * as alphaTab from '@coderline/alphatab'
import { useCallback, useEffect, useRef, useState } from 'react'
import { enregistrerTablature, obtenirMorceau, obtenirTablature, urlPiste, type Morceau as MorceauApi } from './api'
import {
  borner,
  changerCorde,
  changerDuree,
  deplacer,
  deplacerCurseur,
  FRETTE_MAX,
  saisirFrette,
  supprimer,
  type Curseur,
} from './edition'
import { LecteurPistes } from './lecteurPistes'
import { Metronome } from './metronome'
import { nomNote, notesHorsManche, versAlphaTex, type GrilleRythmique, type Tablature } from './tablature'

const VITESSES = Array.from({ length: 11 }, (_, i) => 50 + i * 5)
/** Délai pour taper une frette à deux chiffres (« 1 » puis « 2 » = case 12). */
const DELAI_DEUXIEME_CHIFFRE_MS = 700
const DELAI_ENREGISTREMENT_MS = 800

type Reglages = { vitesse: number; boucle: boolean; decompte: boolean; metronome: boolean; volumeBacking: number; volumeBasse: number }
const REGLAGES_INITIAUX: Reglages = { vitesse: 100, boucle: false, decompte: true, metronome: false, volumeBacking: 100, volumeBasse: 100 }
type Corde = 1 | 2 | 3 | 4
type Sauvegarde = 'enregistre' | 'modifie' | 'erreur'

const NOMS_CORDES = ['', 'Mi', 'La', 'Ré', 'Sol']

export function Morceau({ videoId }: { videoId: string }) {
  const conteneur = useRef<HTMLDivElement>(null)
  const surlignage = useRef<HTMLDivElement>(null)
  const [morceau, setMorceau] = useState<MorceauApi | null>(null)
  const [tablature, setTablature] = useState<Tablature | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [pret, setPret] = useState(false)
  const [enLecture, setEnLecture] = useState(false)
  const [plage, setPlage] = useState<string | null>(null)
  const [reglages, setReglages] = useState(REGLAGES_INITIAUX)
  const [curseur, setCurseur] = useState<Curseur>({ mesure: 0, evenement: 0 })
  const [cordeCourante, setCordeCourante] = useState<Corde>(1)
  const [sauvegarde, setSauvegarde] = useState<Sauvegarde>('enregistre')
  const [rendu, setRendu] = useState(0)

  const reglagesRef = useRef(reglages)
  reglagesRef.current = reglages
  const tablatureRef = useRef(tablature)
  tablatureRef.current = tablature
  const api = useRef<alphaTab.AlphaTabApi | null>(null)
  const lecteurRef = useRef<LecteurPistes | null>(null)
  const modifiee = useRef(false)

  useEffect(() => {
    Promise.all([obtenirMorceau(videoId), obtenirTablature(videoId)])
      .then(([m, t]) => {
        setMorceau(m)
        setTablature(t)
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : String(e)))
  }, [videoId])

  const chargee = tablature !== null

  // alphaTab et le lecteur : créés une fois par morceau.
  useEffect(() => {
    if (!chargee || !conteneur.current) return
    const grille = () => tablatureRef.current!.grille
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
      return r.boucle && r.decompte && at.playbackRange ? metronome.decompte(grille(), r.vitesse / 100) : null
    }

    at.playerReady.on(() => {
      sortie().handler = lecteur
      setPret(true)
    })
    at.playerStateChanged.on((e) => setEnLecture(e.state === alphaTab.synth.PlayerState.Playing))
    at.renderFinished.on(() => setRendu((n) => n + 1))
    at.beatMouseDown.on((beat) => setCurseur({ mesure: beat.voice.bar.index, evenement: beat.index }))
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
        if (reglagesRef.current.metronome) metronome.suivre(grille(), t, reglagesRef.current.vitesse / 100)
        precedent = t
      } else metronome.reinitialiser()
      image = requestAnimationFrame(suivre)
    }
    image = requestAnimationFrame(suivre)
    lecteur.backing.addEventListener('ended', () => at.stop())

    return () => {
      cancelAnimationFrame(image)
      lecteur.detruire()
      at.destroy()
      api.current = null
      lecteurRef.current = null
      setPret(false)
    }
  }, [chargee, videoId])

  // Chaque version de la tablature est re-rendue. Recharger la partition arrête la lecture et revient au
  // début (ADR 0002) : on mémorise la position et l'état de lecture pour les restaurer.
  useEffect(() => {
    const at = api.current
    if (!tablature || !at) return
    const lecteur = lecteurRef.current!
    const premierRendu = !at.score
    const tick = at.tickPosition
    const lisait = lecteur.enLecture || lecteur.decompteEnCours
    if (lisait) lecteur.pause()
    // tex() recharge la partition et la midi de façon synchrone (et remet la position au début) : on
    // restaure juste après. Ne pas passer par midiLoaded.on(), qui rejoue immédiatement le dernier
    // événement aux nouveaux abonnés.
    at.tex(versAlphaTex(tablature))
    if (!premierRendu) {
      at.tickPosition = tick
      if (lisait) at.play()
    }
  }, [tablature])

  // Enregistrement automatique des corrections.
  useEffect(() => {
    if (!tablature || !modifiee.current) return
    setSauvegarde('modifie')
    const id = setTimeout(() => {
      enregistrerTablature(videoId, tablature)
        .then(() => setSauvegarde('enregistre'))
        .catch(() => setSauvegarde('erreur'))
    }, DELAI_ENREGISTREMENT_MS)
    return () => clearTimeout(id)
  }, [tablature, videoId])

  // Cadre autour de l'événement sélectionné.
  useEffect(() => {
    const at = api.current
    const cadre = surlignage.current
    if (!at?.score || !cadre || !conteneur.current) return
    const beat = at.score.tracks[0].staves[0].bars[curseur.mesure]?.voices[0].beats[curseur.evenement]
    const bornes = beat && at.boundsLookup?.findBeat(beat)
    const surface = conteneur.current.querySelector<HTMLElement>('.at-surface')
    if (!bornes || !surface) {
      cadre.style.display = 'none'
      return
    }
    const { x, w } = bornes.visualBounds
    const barre = bornes.barBounds.masterBarBounds.realBounds
    const origine = surface.getBoundingClientRect()
    const cadreParent = cadre.parentElement!.getBoundingClientRect()
    Object.assign(cadre.style, {
      display: 'block',
      left: `${origine.left - cadreParent.left + x - 3}px`,
      top: `${origine.top - cadreParent.top + barre.y}px`,
      width: `${Math.max(w, 12) + 6}px`,
      height: `${barre.h}px`,
    })
  }, [curseur, rendu])

  const modifier = useCallback((operation: (t: Tablature) => Tablature) => {
    setTablature((t) => {
      if (!t) return t
      const nouvelle = operation(t)
      if (nouvelle !== t) modifiee.current = true
      return nouvelle
    })
  }, [])

  // Clavier : édition façon Guitar Pro.
  const dernierChiffre = useRef<{ chiffre: number; quand: number; curseur: Curseur } | null>(null)
  useEffect(() => {
    if (!tablature) return
    const surTouche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement
      if (cible.closest('input, select, textarea')) return
      const t = tablatureRef.current!
      const c = borner(t, curseur)
      const evenement = t.mesures[c.mesure].evenements[c.evenement]

      if (/^[0-9]$/.test(e.key)) {
        let frette = Number(e.key)
        const prec = dernierChiffre.current
        if (prec && performance.now() - prec.quand < DELAI_DEUXIEME_CHIFFRE_MS && prec.curseur === curseur) {
          const deux = prec.chiffre * 10 + frette
          if (deux <= FRETTE_MAX) frette = deux
        }
        dernierChiffre.current = { chiffre: frette, quand: performance.now(), curseur }
        modifier((t) => saisirFrette(t, c, frette, cordeCourante))
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const delta = e.key === 'ArrowUp' ? 1 : -1
        if (evenement.type === 'note' && evenement.position) modifier((t) => changerCorde(t, c, delta))
        else setCordeCourante((k) => Math.min(4, Math.max(1, k + delta)) as Corde)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const sens = e.key === 'ArrowRight' ? 1 : -1
        if (e.altKey) {
          const voisin = c.evenement + sens
          if (voisin >= 0 && voisin < t.mesures[c.mesure].evenements.length) {
            modifier((t) => deplacer(t, c, sens))
            setCurseur({ ...c, evenement: voisin })
          }
        } else setCurseur(deplacerCurseur(t, c, sens))
      } else if (e.key === '+' || e.key === '=') {
        modifier((t) => changerDuree(t, c, 1))
      } else if (e.key === '-') {
        modifier((t) => changerDuree(t, c, -1))
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        modifier((t) => supprimer(t, c))
      } else if (e.key === ' ') {
        api.current?.playPause()
      } else return
      e.preventDefault()
    }
    addEventListener('keydown', surTouche)
    return () => removeEventListener('keydown', surTouche)
  }, [tablature, curseur, cordeCourante, modifier])

  // La corde courante suit la note sélectionnée ; le curseur reste dans sa mesure après une édition.
  useEffect(() => {
    if (!tablature) return
    const c = borner(tablature, curseur)
    if (c.evenement !== curseur.evenement) setCurseur(c)
    const e = tablature.mesures[c.mesure].evenements[c.evenement]
    if (e?.type === 'note' && e.position) setCordeCourante(e.position.corde)
  }, [tablature, curseur])

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
  const reglerGrille = (changement: Partial<GrilleRythmique>) =>
    modifier((t) => ({ ...t, grille: { ...t.grille, ...changement } }))

  if (erreur) return <p className="erreur">{erreur}</p>
  if (!morceau || !tablature) return <p className="vide">Chargement…</p>

  const horsManche = notesHorsManche(tablature)
  const c = borner(tablature, curseur)
  const selection = tablature.mesures[c.mesure].evenements[c.evenement]
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
      <div className="barre-lecture grille">
        <label>
          Tempo
          <input
            type="number"
            min={30}
            max={300}
            step={0.01}
            value={tablature.grille.tempo}
            onChange={(e) => Number(e.target.value) > 0 && reglerGrille({ tempo: Number(e.target.value) })}
          />
          BPM
        </label>
        <label>
          Mesure 1 à
          <input
            type="number"
            min={0}
            step={0.01}
            value={tablature.grille.premiere_mesure_s}
            onChange={(e) => Number(e.target.value) >= 0 && reglerGrille({ premiere_mesure_s: Number(e.target.value) })}
          />
          s
        </label>
        <span className={`etat ${sauvegarde === 'erreur' ? 'echec' : sauvegarde === 'enregistre' ? 'pret' : ''}`}>
          {sauvegarde === 'enregistre' ? 'Enregistré' : sauvegarde === 'modifie' ? 'Enregistrement…' : 'Échec de l’enregistrement'}
        </span>
      </div>
      <p className="meta">
        {tablature.mesures.length} mesures
        {horsManche > 0 && <span className="etat echec"> · {horsManche} note(s) hors manche</span>}
        {' · '}
        Mesure {c.mesure + 1},{' '}
        {selection.type === 'note'
          ? `${nomNote(selection.hauteur)}${selection.position ? ` (corde de ${NOMS_CORDES[selection.position.corde]}, case ${selection.position.frette})` : ' hors manche'}`
          : `silence (corde courante : ${NOMS_CORDES[cordeCourante]})`}
        {plage && ` · Sélection : ${plage}${reglages.boucle ? ' (en boucle)' : ''}`}
      </p>
      <p className="meta aide">
        Clic : sélectionner · ←/→ : naviguer · 0–20 : case · ↑/↓ : corde · +/− : durée · Suppr : effacer · Alt+←/→ :
        déplacer · Espace : lecture · Glisser sur des mesures : choisir la boucle
      </p>
      <div className="tablature-cadre">
        <div ref={conteneur} className="tablature" />
        <div ref={surlignage} className="selection-edition" />
      </div>
    </section>
  )
}
