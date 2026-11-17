"""Modèle de la tablature : la seule version de référence de la ligne de basse d'un morceau."""

from dataclasses import asdict, dataclass, field
from typing import Literal

# Basse 4 cordes en accordage standard. Corde 1 = Mi grave … corde 4 = Sol.
ACCORDAGE_MIDI = (28, 33, 38, 43)  # E1 A1 D2 G2
FRETTE_MAX = 20
DOUBLES_CROCHES_PAR_MESURE = 16  # 4/4

# Durées notables, en doubles croches → (valeur de note, pointée). 1 = ronde, 4 = noire…
DUREES: dict[int, tuple[int, bool]] = {
    16: (1, False),
    12: (2, True),
    8: (2, False),
    6: (4, True),
    4: (4, False),
    3: (8, True),
    2: (8, False),
    1: (16, False),
}


@dataclass(frozen=True)
class Position:
    corde: Literal[1, 2, 3, 4]
    frette: int


@dataclass
class Note:
    hauteur: int
    """Hauteur MIDI."""
    duree: int
    """Durée en doubles croches ; toujours une clé de DUREES."""
    position: Position | None = None
    """None pour une note hors manche."""
    type: Literal["note"] = "note"

    @property
    def hors_manche(self) -> bool:
        return self.position is None


@dataclass
class Silence:
    duree: int
    type: Literal["silence"] = "silence"


Evenement = Note | Silence


@dataclass
class Mesure:
    evenements: list[Evenement] = field(default_factory=list)


@dataclass
class GrilleRythmique:
    tempo: float
    """Noires par minute ; fixe sur tout le morceau."""
    premiere_mesure_s: float
    """Position du début de la mesure 1 dans l'audio, en secondes."""
    signature: tuple[int, int] = (4, 4)

    @property
    def duree_temps_s(self) -> float:
        return 60.0 / self.tempo

    def double_croche_vers_s(self, index: float) -> float:
        return self.premiere_mesure_s + index * self.duree_temps_s / 4

    def s_vers_double_croche(self, t: float) -> float:
        return (t - self.premiere_mesure_s) * 4 / self.duree_temps_s


@dataclass
class Tablature:
    grille: GrilleRythmique
    mesures: list[Mesure]

    def vers_json(self) -> dict:
        return asdict(self)

    @staticmethod
    def depuis_json(d: dict) -> "Tablature":
        def evenement(e: dict) -> Evenement:
            if e["type"] == "silence":
                return Silence(e["duree"])
            pos = e.get("position")
            return Note(e["hauteur"], e["duree"], Position(pos["corde"], pos["frette"]) if pos else None)

        g = d["grille"]
        return Tablature(
            GrilleRythmique(g["tempo"], g["premiere_mesure_s"], tuple(g["signature"])),
            [Mesure([evenement(e) for e in m["evenements"]]) for m in d["mesures"]],
        )
