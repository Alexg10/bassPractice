"""Étape « séparation » du traitement : audio original → piste basse + backing track."""

import logging
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np
import soundfile as sf

from app.traitement import EchecTraitement, dossier_du_morceau

ETAPE = "séparation"
STEM_BASSE = "basse"

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class PistesSeparees:
    piste_basse: Path
    backing_track: Path


class Separateur(Protocol):
    """Sépare un audio en pistes (stems) écrites dans dossier_travail.

    Renvoie un chemin par stem ; le stem de la basse s'appelle STEM_BASSE.
    """

    def separer(self, audio: Path, dossier_travail: Path) -> dict[str, Path]: ...


def separer_pistes(video_id: str, separateur: Separateur, data_dir: Path) -> PistesSeparees:
    dossier = dossier_du_morceau(data_dir, video_id)
    originaux = sorted(dossier.glob("audio-original.*")) if dossier.exists() else []
    if not originaux:
        raise EchecTraitement(ETAPE, "audio_original_absent", "L'audio original de ce morceau est introuvable.")

    with tempfile.TemporaryDirectory(dir=dossier, prefix=".separation-") as travail:
        try:
            stems = separateur.separer(originaux[0], Path(travail))
        except Exception as e:
            log.exception("Séparation de pistes échouée pour %s", video_id)
            raise _echec() from e
        if STEM_BASSE not in stems or len(stems) < 2:
            log.error("Stems inattendus pour %s : %s", video_id, sorted(stems))
            raise _echec()

        pistes = PistesSeparees(dossier / "piste-basse.wav", dossier / "backing-track.wav")
        _ecrire_somme([stems[STEM_BASSE]], pistes.piste_basse)
        _ecrire_somme([p for nom, p in stems.items() if nom != STEM_BASSE], pistes.backing_track)
    return pistes


def _echec() -> EchecTraitement:
    return EchecTraitement(ETAPE, "echec_separation", "La séparation de la piste basse a échoué.")


def _ecrire_somme(chemins: list[Path], sortie: Path) -> None:
    total, sr = sf.read(chemins[0], dtype="float32", always_2d=True)
    for chemin in chemins[1:]:
        signal, sr_stem = sf.read(chemin, dtype="float32", always_2d=True)
        assert sr_stem == sr, "les stems d'une même séparation ont la même fréquence"
        n = min(len(total), len(signal))
        total = total[:n] + signal[:n]
    sf.write(sortie, np.clip(total, -1.0, 1.0), sr, subtype="PCM_16")


class AudioSeparatorDemucs:
    """Implémentation réelle : Demucs v4 (htdemucs) via audio-separator."""

    MODELE = "htdemucs.yaml"
    _NOMS = {"Vocals": "voix", "Drums": "batterie", "Bass": STEM_BASSE, "Other": "autre"}

    def __init__(self, dossier_modeles: Path):
        self._dossier_modeles = dossier_modeles

    def separer(self, audio: Path, dossier_travail: Path) -> dict[str, Path]:
        from audio_separator.separator import Separator

        self._dossier_modeles.mkdir(parents=True, exist_ok=True)
        separator = Separator(
            log_level=logging.WARNING,
            model_file_dir=str(self._dossier_modeles),
            output_dir=str(dossier_travail),
            output_format="WAV",
        )
        separator.load_model(model_filename=self.MODELE)
        fichiers = separator.separate(str(audio), custom_output_names=dict(self._NOMS))
        chemins = {Path(f).stem: dossier_travail / Path(f).name for f in fichiers}
        return {nom: chemins[nom] for nom in self._NOMS.values() if nom in chemins}
