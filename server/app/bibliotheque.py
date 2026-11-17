"""Bibliothèque : les morceaux traités ou en cours de traitement, conservés localement (SQLite)."""

import sqlite3
import threading
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

Statut = Literal["en_cours", "pret", "echec"]


@dataclass(frozen=True)
class Echec:
    etape: str
    code: str
    message: str


@dataclass(frozen=True)
class Morceau:
    video_id: str
    titre: str | None
    duree_s: int | None
    statut: Statut
    etape: str | None
    """Étape du traitement en cours ; None si en attente, prêt ou en échec."""
    echec: Echec | None
    ajoute_le: str


_SCHEMA = """
CREATE TABLE IF NOT EXISTS morceaux (
    video_id TEXT PRIMARY KEY,
    titre TEXT,
    duree_s INTEGER,
    statut TEXT NOT NULL,
    etape TEXT,
    echec_etape TEXT,
    echec_code TEXT,
    echec_message TEXT,
    ajoute_le TEXT NOT NULL
)
"""


class Bibliotheque:
    def __init__(self, chemin: Path):
        chemin.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(chemin, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._verrou = threading.Lock()
        with self._verrou, self._db:
            self._db.execute(_SCHEMA)

    def _ecrire(self, sql: str, *params) -> None:
        with self._verrou, self._db:
            self._db.execute(sql, params)

    def ajouter(self, video_id: str) -> None:
        """Ajoute le morceau en attente de traitement (ou le remet en attente s'il existait)."""
        maintenant = datetime.now(UTC).isoformat(timespec="microseconds")
        self._ecrire(
            """INSERT INTO morceaux (video_id, statut, ajoute_le) VALUES (?, 'en_cours', ?)
               ON CONFLICT(video_id) DO UPDATE SET statut='en_cours', etape=NULL,
                 echec_etape=NULL, echec_code=NULL, echec_message=NULL, ajoute_le=excluded.ajoute_le""",
            video_id,
            maintenant,
        )

    def commencer_etape(self, video_id: str, etape: str) -> None:
        self._ecrire("UPDATE morceaux SET etape=? WHERE video_id=?", etape, video_id)

    def renseigner(self, video_id: str, titre: str, duree_s: int) -> None:
        self._ecrire("UPDATE morceaux SET titre=?, duree_s=? WHERE video_id=?", titre, duree_s, video_id)

    def marquer_pret(self, video_id: str) -> None:
        self._ecrire("UPDATE morceaux SET statut='pret', etape=NULL WHERE video_id=?", video_id)

    def marquer_echec(self, video_id: str, echec: Echec) -> None:
        self._ecrire(
            """UPDATE morceaux SET statut='echec', etape=NULL, echec_etape=?, echec_code=?, echec_message=?
               WHERE video_id=?""",
            echec.etape,
            echec.code,
            echec.message,
            video_id,
        )

    def marquer_interrompus(self) -> None:
        """Au démarrage : un traitement encore « en cours » a été interrompu par l'arrêt du serveur."""
        self._ecrire(
            """UPDATE morceaux SET statut='echec', echec_etape=COALESCE(etape, 'téléchargement'),
                 echec_code='interrompu', echec_message='Le traitement a été interrompu.', etape=NULL
               WHERE statut='en_cours'"""
        )

    def obtenir(self, video_id: str) -> Morceau | None:
        with self._verrou:
            ligne = self._db.execute("SELECT * FROM morceaux WHERE video_id=?", (video_id,)).fetchone()
        return _morceau(ligne) if ligne else None

    def lister(self) -> list[Morceau]:
        with self._verrou:
            lignes = self._db.execute("SELECT * FROM morceaux ORDER BY ajoute_le DESC").fetchall()
        return [_morceau(l) for l in lignes]


def _morceau(l: sqlite3.Row) -> Morceau:
    echec = Echec(l["echec_etape"], l["echec_code"], l["echec_message"]) if l["statut"] == "echec" else None
    return Morceau(l["video_id"], l["titre"], l["duree_s"], l["statut"], l["etape"], echec, l["ajoute_le"])
