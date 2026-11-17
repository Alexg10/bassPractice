import pytest

from app.quantification import NoteDetectee, quantifier
from app.tablature import DOUBLES_CROCHES_PAR_MESURE, DUREES, GrilleRythmique, Note, Silence

# 120 BPM : une noire = 0,5 s, une double croche = 0,125 s, une mesure = 2 s. Mesure 1 à 1 s.
GRILLE = GrilleRythmique(tempo=120, premiere_mesure_s=1.0)
NOIRE = 0.5


def note(debut_temps: float, duree_temps: float, hauteur: int = 40, jitter: float = 0.0) -> NoteDetectee:
    debut = 1.0 + debut_temps * NOIRE + jitter
    return NoteDetectee(debut, debut + duree_temps * NOIRE, hauteur)


def resume(mesure):
    return [(e.duree, e.hauteur) if isinstance(e, Note) else (e.duree, None) for e in mesure.evenements]


def test_quatre_noires_remplissent_une_mesure():
    mesures = quantifier([note(i, 1, 40 + i) for i in range(4)], GRILLE, nb_mesures=1)
    assert resume(mesures[0]) == [(4, 40), (4, 41), (4, 42), (4, 43)]


def test_les_petits_ecarts_de_jeu_sont_cales_sur_la_grille():
    notes = [note(0, 0.5, jitter=0.03), note(0.5, 0.5, jitter=-0.04), note(1, 1, jitter=0.02), note(2, 2, jitter=-0.05)]
    mesures = quantifier(notes, GRILLE, nb_mesures=1)
    assert [d for d, _ in resume(mesures[0])] == [2, 2, 4, 8]


def test_un_trou_devient_des_silences_cales_sur_les_temps():
    # Trou sur les temps 2 et 3 : deux soupirs, pas une demi-pause à cheval sur le milieu de la mesure.
    mesures = quantifier([note(0, 1), note(3, 1)], GRILLE, nb_mesures=1)
    assert resume(mesures[0]) == [(4, 40), (4, None), (4, None), (4, 40)]


def test_un_silence_commence_par_les_petites_valeurs_jusqu_au_temps_suivant():
    # Double croche puis trou jusqu'au temps 3 : quart de soupir + demi-soupir + soupir.
    mesures = quantifier([note(0, 0.25), note(2, 2)], GRILLE, nb_mesures=1)
    assert resume(mesures[0]) == [(1, 40), (1, None), (2, None), (4, None), (8, 40)]


def test_une_mesure_vide_est_un_silence_d_une_ronde():
    mesures = quantifier([note(0, 4)], GRILLE, nb_mesures=2)
    assert resume(mesures[1]) == [(16, None)]


def test_une_note_qui_deborde_sur_la_mesure_suivante_est_coupee_a_la_barre():
    mesures = quantifier([note(2, 4)], GRILLE, nb_mesures=2)
    assert resume(mesures[0]) == [(8, None), (8, 40)]
    assert resume(mesures[1]) == [(16, None)]


def test_une_note_est_coupee_par_la_suivante():
    mesures = quantifier([note(0, 3, 40), note(1, 3, 45)], GRILLE, nb_mesures=1)
    assert resume(mesures[0]) == [(4, 40), (12, 45)]


def test_une_duree_non_notable_est_arrondie_en_dessous_et_completee_par_un_silence():
    # 5 doubles croches → noire (4), puis le reste devient silence jusqu'à la note suivante.
    mesures = quantifier([note(0, 1.25), note(2, 2)], GRILLE, nb_mesures=1)
    assert resume(mesures[0]) == [(4, 40), (4, None), (8, 40)]


def test_une_note_tres_courte_dure_au_moins_une_double_croche():
    mesures = quantifier([NoteDetectee(1.0, 1.02, 40)], GRILLE, nb_mesures=1)
    assert resume(mesures[0])[0] == (1, 40)


def test_les_notes_avant_la_mesure_1_sont_ignorees():
    mesures = quantifier([NoteDetectee(0.2, 0.6, 30), note(0, 4)], GRILLE, nb_mesures=1)
    assert resume(mesures[0]) == [(16, 40)]


def test_deux_notes_calees_au_meme_endroit_n_en_font_qu_une():
    mesures = quantifier([note(0, 1, 40, jitter=-0.02), note(0, 1, 41, jitter=0.02)], GRILLE, nb_mesures=1)
    assert resume(mesures[0])[0] == (4, 40)


@pytest.mark.parametrize("graine", range(20))
def test_chaque_mesure_dure_exactement_16_doubles_croches(graine):
    import random

    rnd = random.Random(graine)
    t, notes = 1.0, []
    while t < 1.0 + 8 * 2.0:
        d = rnd.choice([0.06, 0.125, 0.2, 0.25, 0.4, 0.5, 0.9, 1.0, 1.7])
        if rnd.random() < 0.8:
            notes.append(NoteDetectee(t, t + d, rnd.randint(28, 60)))
        t += d + rnd.choice([0, 0, 0.1, 0.3])
    for m in quantifier(notes, GRILLE, nb_mesures=8):
        assert sum(e.duree for e in m.evenements) == DOUBLES_CROCHES_PAR_MESURE
        assert all(e.duree in DUREES for e in m.evenements)
