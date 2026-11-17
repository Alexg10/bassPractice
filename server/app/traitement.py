"""Éléments communs aux étapes du traitement (téléchargement, séparation, transcription)."""

from pathlib import Path


class EchecTraitement(Exception):
    """Échec d'une étape du traitement, avec un code stable et un message pour l'utilisateur."""

    def __init__(self, etape: str, code: str, message: str):
        super().__init__(message)
        self.etape = etape
        self.code = code
        self.message = message


def dossier_du_morceau(data_dir: Path, video_id: str) -> Path:
    return data_dir / "morceaux" / video_id
