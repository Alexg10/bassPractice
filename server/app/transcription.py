"""Étape « transcription » du traitement : grille rythmique + notes de la piste basse → tablature initiale."""

import json
import logging
import math
from pathlib import Path

import soundfile as sf

from app.detection_notes import detecter_notes
from app.grille import detecter_grille
from app.positions import choisir_positions
from app.quantification import quantifier
from app.tablature import DOUBLES_CROCHES_PAR_MESURE, Note, Tablature
from app.traitement import FICHIER_TABLATURE, EchecTraitement, dossier_du_morceau

ETAPE = "transcription"

log = logging.getLogger(__name__)


def transcrire(video_id: str, data_dir: Path) -> Tablature:
    """Initialise la tablature du morceau. Écrase toute tablature existante, corrections comprises."""
    dossier = dossier_du_morceau(data_dir, video_id)
    original, basse = dossier / "audio-original.wav", dossier / "piste-basse.wav"
    if not original.exists() or not basse.exists():
        raise EchecTraitement(ETAPE, "pistes_absentes", "La piste basse de ce morceau est introuvable.")

    try:
        grille = detecter_grille(original, basse)
        notes = detecter_notes(basse)
        duree_s = sf.info(original).duration
    except Exception as e:
        log.exception("Transcription échouée pour %s", video_id)
        raise EchecTraitement(ETAPE, "echec_transcription", "La transcription de la ligne de basse a échoué.") from e

    nb_mesures = max(1, math.ceil(grille.s_vers_double_croche(duree_s) / DOUBLES_CROCHES_PAR_MESURE))
    mesures = quantifier(notes, grille, nb_mesures)

    toutes = [e for m in mesures for e in m.evenements if isinstance(e, Note)]
    for note, position in zip(toutes, choisir_positions([n.hauteur for n in toutes])):
        note.position = position

    tablature = Tablature(grille, mesures)
    (dossier / FICHIER_TABLATURE).write_text(json.dumps(tablature.vers_json(), ensure_ascii=False, indent=1))
    return tablature


def lire_tablature(video_id: str, data_dir: Path) -> Tablature | None:
    chemin = dossier_du_morceau(data_dir, video_id) / FICHIER_TABLATURE
    return Tablature.depuis_json(json.loads(chemin.read_text())) if chemin.exists() else None
