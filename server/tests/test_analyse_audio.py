import numpy as np
import pytest
import soundfile as sf

from app.detection_notes import detecter_notes
from app.grille import detecter_grille
from tests.audio_synthetique import SR, batterie, ligne_de_basse

TEMPO = 100
TEMPS_S = 60 / TEMPO
PREMIERE_MESURE_S = 0.8
NB_MESURES = 8
DUREE_S = PREMIERE_MESURE_S + NB_MESURES * 4 * TEMPS_S + 1


def riff() -> list[tuple[float, float, int]]:
    """Par mesure : Mi1 (noire), Sol1 (noire), La1 (croche), La1 (croche), Ré2 (noire)."""
    notes = []
    for m in range(NB_MESURES):
        t0 = PREMIERE_MESURE_S + m * 4 * TEMPS_S
        for debut_temps, duree_temps, hauteur in [(0, 1, 28), (1, 1, 31), (2, 0.5, 33), (2.5, 0.5, 33), (3, 1, 38)]:
            notes.append((t0 + debut_temps * TEMPS_S, duree_temps * TEMPS_S, hauteur))
    return notes


@pytest.fixture(scope="module")
def fichiers(tmp_path_factory):
    d = tmp_path_factory.mktemp("audio")
    basse = ligne_de_basse(riff(), DUREE_S)
    mix = basse + batterie(TEMPO, PREMIERE_MESURE_S, NB_MESURES, DUREE_S)
    sf.write(d / "piste-basse.wav", basse, SR)
    sf.write(d / "audio-original.wav", mix / np.abs(mix).max(), SR)
    return d


def test_detecte_le_tempo_et_le_debut_de_la_premiere_mesure(fichiers):
    grille = detecter_grille(fichiers / "audio-original.wav", fichiers / "piste-basse.wav")

    assert grille.tempo == pytest.approx(TEMPO, abs=1.5)
    assert grille.premiere_mesure_s == pytest.approx(PREMIERE_MESURE_S, abs=0.04)


def test_detecte_les_notes_de_la_ligne_de_basse(fichiers):
    notes = detecter_notes(fichiers / "piste-basse.wav")
    attendues = riff()

    assert [n.hauteur for n in notes] == [h for _, _, h in attendues]
    for n, (debut, duree, _) in zip(notes, attendues):
        assert n.debut_s == pytest.approx(debut, abs=0.04)
        assert n.fin_s - n.debut_s == pytest.approx(duree, abs=0.12)


def test_une_piste_basse_silencieuse_ne_donne_aucune_note(tmp_path):
    sf.write(tmp_path / "vide.wav", np.zeros(SR * 3, dtype=np.float32), SR)
    assert detecter_notes(tmp_path / "vide.wav") == []
