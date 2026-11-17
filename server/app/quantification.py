"""Caler des notes détectées (en secondes) sur la grille rythmique, en mesures de 4/4."""

from dataclasses import dataclass

from app.tablature import DOUBLES_CROCHES_PAR_MESURE, DUREES, GrilleRythmique, Mesure, Note, Silence

_DUREES_DE_NOTE = sorted(DUREES, reverse=True)
_DUREES_DE_SILENCE = [16, 8, 4, 2, 1]  # pas de silences pointés


@dataclass(frozen=True)
class NoteDetectee:
    debut_s: float
    fin_s: float
    hauteur: int


def quantifier(notes: list[NoteDetectee], grille: GrilleRythmique, nb_mesures: int) -> list[Mesure]:
    fin_morceau = nb_mesures * DOUBLES_CROCHES_PAR_MESURE

    # 1. En doubles croches, arrondies à la grille ; une seule note par position.
    calees: dict[int, tuple[int, int]] = {}
    for n in sorted(notes, key=lambda n: n.debut_s):
        debut = round(grille.s_vers_double_croche(n.debut_s))
        fin = max(round(grille.s_vers_double_croche(n.fin_s)), debut + 1)
        if 0 <= debut < fin_morceau and debut not in calees:
            calees[debut] = (fin, n.hauteur)

    # 2. Chaque note s'arrête au plus tard à la note suivante et à la barre de mesure.
    debuts = sorted(calees)
    mesures = [Mesure() for _ in range(nb_mesures)]
    curseurs = [0] * nb_mesures
    for i, debut in enumerate(debuts):
        fin, hauteur = calees[debut]
        barre = (debut // DOUBLES_CROCHES_PAR_MESURE + 1) * DOUBLES_CROCHES_PAR_MESURE
        suivante = debuts[i + 1] if i + 1 < len(debuts) else fin_morceau
        longueur = min(fin, barre, suivante) - debut

        index, dans_mesure = divmod(debut, DOUBLES_CROCHES_PAR_MESURE)
        _ajouter_silences(mesures[index], curseurs[index], dans_mesure)
        duree = next(d for d in _DUREES_DE_NOTE if d <= longueur)
        mesures[index].evenements.append(Note(hauteur, duree))
        curseurs[index] = dans_mesure + duree

    # 3. On complète chaque mesure par des silences.
    for mesure, curseur in zip(mesures, curseurs):
        _ajouter_silences(mesure, curseur, DOUBLES_CROCHES_PAR_MESURE)
    return mesures


def _ajouter_silences(mesure: Mesure, de: int, a: int) -> None:
    """Silences de `de` à `a`, chacun aligné sur sa propre valeur (lecture solfège)."""
    p = de
    while p < a:
        d = next(d for d in _DUREES_DE_SILENCE if d <= a - p and p % d == 0)
        mesure.evenements.append(Silence(d))
        p += d
