"""Audio de test : une ligne de basse et une batterie minimale, au tempo et aux notes connus."""

import numpy as np

SR = 22050


def silence(duree_s: float) -> np.ndarray:
    return np.zeros(int(duree_s * SR), dtype=np.float32)


def note_de_basse(hauteur: int, duree_s: float) -> np.ndarray:
    """Son de basse simplifié : fondamentale + harmoniques, attaque nette, décroissance."""
    t = np.arange(int(duree_s * SR)) / SR
    f0 = 440.0 * 2 ** ((hauteur - 69) / 12)
    son = sum(np.sin(2 * np.pi * f0 * k * t) / k for k in range(1, 6))
    enveloppe = np.minimum(t / 0.005, 1) * np.exp(-t * 2.5) * np.minimum((duree_s - t) / 0.01, 1)
    return (0.3 * son * enveloppe).astype(np.float32)


def coup_de_grosse_caisse(fort: bool) -> np.ndarray:
    t = np.arange(int(0.12 * SR)) / SR
    son = np.sin(2 * np.pi * (50 + 80 * np.exp(-t * 40)) * t) * np.exp(-t * 30)
    clic = np.random.default_rng(0).normal(0, 1, len(t)) * np.exp(-t * 300) * 0.3
    return ((0.9 if fort else 0.5) * (son + clic)).astype(np.float32)


def placer(piste: np.ndarray, son: np.ndarray, debut_s: float) -> None:
    i = int(debut_s * SR)
    n = min(len(son), len(piste) - i)
    piste[i : i + n] += son[:n]


def batterie(tempo: float, premiere_mesure_s: float, nb_mesures: int, duree_s: float) -> np.ndarray:
    piste = silence(duree_s)
    temps = 60 / tempo
    for i in range(nb_mesures * 4):
        placer(piste, coup_de_grosse_caisse(fort=i % 4 == 0), premiere_mesure_s + i * temps)
    return piste


def ligne_de_basse(notes: list[tuple[float, float, int]], duree_s: float) -> np.ndarray:
    """notes : (début_s, durée_s, hauteur MIDI)."""
    piste = silence(duree_s)
    for debut, duree, hauteur in notes:
        placer(piste, note_de_basse(hauteur, duree * 0.95), debut)
    return piste
