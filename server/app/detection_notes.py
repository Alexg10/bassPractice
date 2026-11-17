"""Détection des notes de la piste basse (monophonique) avec pYIN."""

from pathlib import Path

import librosa
import numpy as np

from app.quantification import NoteDetectee

SR = 22050
HOP = 256
FMIN = librosa.note_to_hz("A0")  # sous le Mi grave, pour repérer les notes hors manche
FMAX = librosa.note_to_hz("G4")
DUREE_MIN_S = 0.05
SEUIL_SILENCE = 1e-3
MARGE_ATTAQUE_S = 0.1
ECART_FUSION_S = 0.08  # < une double croche à 160 BPM (94 ms)


def detecter_notes(piste_basse: Path) -> list[NoteDetectee]:
    y, _ = librosa.load(piste_basse, sr=SR, mono=True)
    if np.abs(y).max() < SEUIL_SILENCE:
        return []

    f0, voise, _ = librosa.pyin(y, fmin=FMIN, fmax=FMAX, sr=SR, frame_length=4096, hop_length=HOP)
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=HOP)[0][: len(f0)]
    voise &= rms > max(SEUIL_SILENCE, 0.05 * np.percentile(rms, 95))
    hauteurs = np.where(voise, np.round(librosa.hz_to_midi(np.nan_to_num(f0, nan=1.0))), -1).astype(int)

    # Frontières : attaques détectées + changements de hauteur stables.
    # pYIN analyse des fenêtres larges (~190 ms) : il « voit » une note avant son attaque. Les attaques
    # sont donc les frontières de référence ; un changement de hauteur ne compte que loin de toute attaque
    # (legato, hammer-on…).
    attaques = librosa.onset.onset_detect(y=y, sr=SR, hop_length=HOP, backtrack=True).tolist()
    marge = int(MARGE_ATTAQUE_S * SR / HOP)
    legato = [c for c in _changements_de_hauteur(hauteurs) if all(abs(c - a) > marge for a in attaques)]
    frontieres = _fusionner_proches(sorted(set(attaques) | set(legato) | {0, len(hauteurs)}))

    notes = []
    for a, b in zip(frontieres, frontieres[1:]):
        segment = hauteurs[a:b]
        voisees = np.flatnonzero(segment >= 0)
        if len(voisees) < max(1, 0.5 * len(segment)):
            continue
        debut, fin = a + voisees[0], a + voisees[-1] + 1
        t_debut, t_fin = (librosa.frames_to_time(x, sr=SR, hop_length=HOP) for x in (debut, fin))
        if t_fin - t_debut >= DUREE_MIN_S:
            notes.append(NoteDetectee(float(t_debut), float(t_fin), int(np.median(segment[voisees]))))
    return notes


def _fusionner_proches(frontieres: list[int]) -> list[int]:
    """Deux frontières à moins de ECART_FUSION_S sont la même ; la dernière est la plus proche de l'attaque
    réelle (la première vient en général de la fin de la note précédente)."""
    ecart_min = int(ECART_FUSION_S * SR / HOP)
    gardees = [frontieres[0]]
    for f in frontieres[1:]:
        if f - gardees[-1] < ecart_min and len(gardees) > 1:
            gardees[-1] = f
        elif f - gardees[-1] >= ecart_min:
            gardees.append(f)
    gardees[-1] = frontieres[-1]
    return gardees


def _changements_de_hauteur(hauteurs: np.ndarray, stabilite: int = 4) -> set[int]:
    """Indices où une nouvelle hauteur voisée tient au moins `stabilite` trames (legato sans attaque)."""
    changements, courante = set(), -1
    for i in range(len(hauteurs) - stabilite):
        h = hauteurs[i]
        if h >= 0 and h != courante and np.all(hauteurs[i : i + stabilite] == h):
            if courante >= 0:
                changements.add(i)
            courante = h
        elif h < 0:
            courante = -1
    return changements
