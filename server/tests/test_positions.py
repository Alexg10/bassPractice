from app.positions import choisir_positions
from app.tablature import Position


def test_une_note_jouable_seulement_a_vide_sur_la_corde_de_mi():
    assert choisir_positions([28]) == [Position(1, 0)]


def test_une_note_seule_se_joue_le_plus_bas_possible_sur_le_manche():
    # La (33) : corde de La à vide plutôt que Mi case 5.
    assert choisir_positions([33]) == [Position(2, 0)]


def test_une_note_repetee_garde_la_meme_position():
    positions = choisir_positions([40, 40, 40])
    assert len(set(positions)) == 1


def test_reste_dans_la_position_de_la_main_plutot_que_de_redescendre():
    # Do4 (60) n'existe qu'en haut du manche (Sol case 17) ; les notes suivantes restent vers la case 17.
    assert choisir_positions([60, 55, 50]) == [Position(4, 17), Position(3, 17), Position(2, 17)]


def test_une_corde_a_vide_evite_un_deplacement():
    # Do2 (36) sur La case 3, puis Sol2 (43) : Sol à vide plutôt que Ré case 5.
    assert choisir_positions([36, 43]) == [Position(2, 3), Position(4, 0)]


def test_les_notes_hors_manche_n_ont_pas_de_position():
    # Ré1 (26) est sous le Mi grave ; 70 est au-delà de la case 20 de la corde de Sol.
    assert choisir_positions([26, 33, 70]) == [None, Position(2, 0), None]
