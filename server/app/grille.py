"""Détection de la grille rythmique : tempo fixe et début de la mesure 1."""

from pathlib import Path

import librosa
import numpy as np

from app.tablature import GrilleRythmique

SR = 22050
HOP = 256


def detecter_grille(audio_original: Path, piste_basse: Path) -> GrilleRythmique:
    y, _ = librosa.load(audio_original, sr=SR, mono=True)
    _, temps = librosa.beat.beat_track(y=y, sr=SR, hop_length=HOP, units="time", trim=False)
    if len(temps) < 4:
        return GrilleRythmique(tempo=120.0, premiere_mesure_s=0.0)

    # Tempo fixe : on ajuste une droite temps = phase + k·période sur les temps détectés.
    k = np.round((temps - temps[0]) / np.median(np.diff(temps)))
    periode, phase = np.polyfit(k, temps, 1)

    # Lequel des 4 temps est le « 1 » ? Celui où les graves attaquent le plus fort : la grosse caisse
    # et la basse (souvent la fondamentale) tombent en général sur le premier temps.
    yb, _ = librosa.load(piste_basse, sr=SR, mono=True)
    attaques = _attaques_normalisees(yb) + _attaques_normalisees(y, fmax=200)
    instants = librosa.frames_to_time(np.arange(len(attaques)), sr=SR, hop_length=HOP)

    def force_des_premiers_temps(decalage: int) -> float:
        debuts = phase + (decalage + 4 * np.arange(int(len(temps) / 4) + 1)) * periode
        # Le pic d'attaque suit de quelques trames l'instant du temps : on prend le max autour.
        fenetre = int(0.06 * SR / HOP)
        indices = np.searchsorted(instants, debuts)
        return float(sum(attaques[max(0, i - fenetre) : i + fenetre + 1].max(initial=0) for i in indices))

    decalage = max(range(4), key=force_des_premiers_temps)
    premiere = phase + decalage * periode
    # Mesure 1 = première mesure complète qui commence avec la musique (pas avant le 1er temps détecté).
    while premiere - 4 * periode >= temps[0] - periode / 2:
        premiere -= 4 * periode
    return GrilleRythmique(tempo=round(float(60.0 / periode), 2), premiere_mesure_s=round(float(premiere), 3))


def _attaques_normalisees(y: np.ndarray, fmax: float | None = None) -> np.ndarray:
    if fmax is None:
        env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    else:
        mel = librosa.feature.melspectrogram(y=y, sr=SR, hop_length=HOP, fmax=fmax, n_mels=32)
        env = librosa.onset.onset_strength(S=librosa.power_to_db(mel), sr=SR, hop_length=HOP)
    return env / (env.max() or 1.0)
