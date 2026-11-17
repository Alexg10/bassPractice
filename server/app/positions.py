"""Choisir la position (corde + frette) de chaque note en limitant les déplacements de la main gauche."""

from app.tablature import ACCORDAGE_MIDI, FRETTE_MAX, Position

# Poids de la fonction de coût (sans unité, relatifs les uns aux autres).
COUT_PAR_CASE_DE_DEPLACEMENT = 1.0
COUT_PAR_CHANGEMENT_DE_CORDE = 0.3
COUT_PAR_CASE_DE_HAUTEUR = 0.05  # à déplacement égal, on préfère le bas du manche


def candidates(hauteur: int) -> list[Position]:
    return [
        Position(corde, hauteur - midi)
        for corde, midi in enumerate(ACCORDAGE_MIDI, start=1)
        if 0 <= hauteur - midi <= FRETTE_MAX
    ]


def _cout_transition(a: Position, b: Position) -> float:
    # Une corde à vide ne demande pas de déplacer la main.
    deplacement = 0 if a.frette == 0 or b.frette == 0 else abs(a.frette - b.frette)
    return COUT_PAR_CASE_DE_DEPLACEMENT * deplacement + COUT_PAR_CHANGEMENT_DE_CORDE * abs(a.corde - b.corde)


def choisir_positions(hauteurs: list[int]) -> list[Position | None]:
    """Viterbi sur les positions possibles ; une note hors manche (aucune position) coupe la chaîne."""
    resultat: list[Position | None] = []
    couts: dict[Position, float] = {}
    chemins: dict[Position, list[Position]] = {}

    def vider_chaine():
        if couts:
            resultat.extend(chemins[min(couts, key=couts.get)])
        couts.clear()
        chemins.clear()

    for hauteur in hauteurs:
        options = candidates(hauteur)
        if not options:
            vider_chaine()
            resultat.append(None)
            continue
        nouveaux_couts, nouveaux_chemins = {}, {}
        for pos in options:
            statique = COUT_PAR_CASE_DE_HAUTEUR * pos.frette
            if couts:
                prec = min(couts, key=lambda p: couts[p] + _cout_transition(p, pos))
                nouveaux_couts[pos] = couts[prec] + _cout_transition(prec, pos) + statique
                nouveaux_chemins[pos] = chemins[prec] + [pos]
            else:
                nouveaux_couts[pos] = statique
                nouveaux_chemins[pos] = [pos]
        couts, chemins = nouveaux_couts, nouveaux_chemins
    vider_chaine()
    return resultat
