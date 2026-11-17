import numpy as np
import pytest
import soundfile as sf

from app.tablature import Note, Position, Silence
from app.traitement import EchecTraitement, dossier_du_morceau
from app.transcription import lire_tablature, transcrire
from tests.audio_synthetique import SR, batterie, ligne_de_basse
from tests.test_analyse_audio import DUREE_S, NB_MESURES, PREMIERE_MESURE_S, TEMPO, riff

VIDEO_ID = "dQw4w9WgXcQ"


@pytest.fixture(scope="module")
def data_dir(tmp_path_factory):
    data = tmp_path_factory.mktemp("data")
    dossier = dossier_du_morceau(data, VIDEO_ID)
    dossier.mkdir(parents=True)
    basse = ligne_de_basse(riff(), DUREE_S)
    mix = basse + batterie(TEMPO, PREMIERE_MESURE_S, NB_MESURES, DUREE_S)
    sf.write(dossier / "piste-basse.wav", basse, SR)
    sf.write(dossier / "audio-original.wav", mix / np.abs(mix).max(), SR)
    return data


@pytest.fixture(scope="module")
def tablature(data_dir):
    return transcrire(VIDEO_ID, data_dir)


def test_la_grille_est_detectee(tablature):
    assert tablature.grille.tempo == pytest.approx(TEMPO, abs=1.5)
    assert tablature.grille.premiere_mesure_s == pytest.approx(PREMIERE_MESURE_S, abs=0.04)


def test_les_mesures_du_riff_sont_retranscrites(tablature):
    # Mi1 noire, Sol1 noire, La1 croche, La1 croche, Ré2 noire ; durées en doubles croches.
    for mesure in tablature.mesures[: NB_MESURES - 1]:
        assert [(e.hauteur, e.duree) for e in mesure.evenements] == [(28, 4), (31, 4), (33, 2), (33, 2), (38, 4)]
    # La toute dernière note s'éteint d'elle-même : seule sa fin peut être un peu plus courte.
    derniere = [e for e in tablature.mesures[NB_MESURES - 1].evenements if isinstance(e, Note)]
    assert [n.hauteur for n in derniere] == [28, 31, 33, 33, 38]


def test_chaque_note_a_une_position_jouable(tablature):
    notes = [e for m in tablature.mesures for e in m.evenements if isinstance(e, Note)]
    assert notes and all(n.position is not None for n in notes)
    assert notes[0].position == Position(1, 0)


def test_la_fin_du_morceau_est_faite_de_silences(tablature):
    assert all(isinstance(e, Silence) for m in tablature.mesures[NB_MESURES:] for e in m.evenements)


def test_la_tablature_est_enregistree_et_relue_a_l_identique(tablature, data_dir):
    assert lire_tablature(VIDEO_ID, data_dir) == tablature


def test_echoue_sans_piste_basse(tmp_path):
    with pytest.raises(EchecTraitement) as e:
        transcrire(VIDEO_ID, tmp_path)
    assert (e.value.etape, e.value.code) == ("transcription", "pistes_absentes")
