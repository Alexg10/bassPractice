from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from app.separation import separer_pistes
from app.traitement import EchecTraitement, dossier_du_morceau

SR = 44100
VIDEO_ID = "dQw4w9WgXcQ"


def ecrire(chemin: Path, signal: np.ndarray) -> Path:
    sf.write(chemin, signal, SR)
    return chemin


def stereo(valeur: float, n: int = SR) -> np.ndarray:
    return np.full((n, 2), valeur, dtype=np.float32)


class FakeSeparateur:
    """Produit des pistes constantes : voix 0.1, batterie 0.2, basse 0.3, autre 0.05."""

    def __init__(self, stems=("voix", "batterie", "basse", "autre"), erreur: Exception | None = None):
        self.stems = stems
        self.erreur = erreur
        self.appels: list[Path] = []

    def separer(self, audio: Path, dossier_travail: Path) -> dict[str, Path]:
        self.appels.append(audio)
        if self.erreur:
            raise self.erreur
        valeurs = {"voix": 0.1, "batterie": 0.2, "basse": 0.3, "autre": 0.05}
        return {s: ecrire(dossier_travail / f"{s}.wav", stereo(valeurs[s])) for s in self.stems}


@pytest.fixture
def morceau(tmp_path) -> Path:
    dossier = dossier_du_morceau(tmp_path, VIDEO_ID)
    dossier.mkdir(parents=True)
    ecrire(dossier / "audio-original.wav", stereo(0.65))
    return dossier


def test_produit_la_piste_basse_et_la_backing_track_dans_le_dossier_du_morceau(tmp_path, morceau):
    pistes = separer_pistes(VIDEO_ID, FakeSeparateur(), tmp_path)

    assert pistes.piste_basse == morceau / "piste-basse.wav"
    assert pistes.backing_track == morceau / "backing-track.wav"
    basse, sr = sf.read(pistes.piste_basse)
    assert sr == SR
    assert np.allclose(basse, 0.3, atol=1e-4)


def test_la_backing_track_est_la_somme_des_pistes_sauf_la_basse(tmp_path, morceau):
    pistes = separer_pistes(VIDEO_ID, FakeSeparateur(), tmp_path)

    backing, _ = sf.read(pistes.backing_track)
    assert backing.shape == (SR, 2)
    assert np.allclose(backing, 0.1 + 0.2 + 0.05, atol=1e-4)


def test_separe_l_audio_original_quel_que_soit_son_format(tmp_path, morceau):
    (morceau / "audio-original.wav").rename(morceau / "audio-original.webm")
    separateur = FakeSeparateur()

    separer_pistes(VIDEO_ID, separateur, tmp_path)

    assert separateur.appels == [morceau / "audio-original.webm"]


def test_ne_laisse_que_les_deux_pistes_utiles(tmp_path, morceau):
    separer_pistes(VIDEO_ID, FakeSeparateur(), tmp_path)

    assert sorted(p.name for p in morceau.iterdir()) == [
        "audio-original.wav",
        "backing-track.wav",
        "piste-basse.wav",
    ]


def test_une_piste_basse_quasi_vide_n_est_pas_une_erreur(tmp_path, morceau):
    class SansBasse(FakeSeparateur):
        def separer(self, audio, dossier_travail):
            stems = super().separer(audio, dossier_travail)
            ecrire(stems["basse"], stereo(0.0))
            return stems

    pistes = separer_pistes(VIDEO_ID, SansBasse(), tmp_path)

    assert np.allclose(sf.read(pistes.piste_basse)[0], 0.0)


def test_echoue_si_l_audio_original_est_absent(tmp_path):
    with pytest.raises(EchecTraitement) as e:
        separer_pistes(VIDEO_ID, FakeSeparateur(), tmp_path)

    assert (e.value.etape, e.value.code) == ("séparation", "audio_original_absent")


def test_echoue_si_le_separateur_ne_rend_pas_de_basse(tmp_path, morceau):
    with pytest.raises(EchecTraitement) as e:
        separer_pistes(VIDEO_ID, FakeSeparateur(stems=("voix", "autre")), tmp_path)

    assert (e.value.etape, e.value.code) == ("séparation", "echec_separation")


def test_une_erreur_du_separateur_devient_un_echec_de_l_etape(tmp_path, morceau):
    with pytest.raises(EchecTraitement) as e:
        separer_pistes(VIDEO_ID, FakeSeparateur(erreur=RuntimeError("MPS out of memory")), tmp_path)

    assert (e.value.etape, e.value.code) == ("séparation", "echec_separation")
    assert not any(p.name.startswith("piste-basse") for p in morceau.iterdir())
