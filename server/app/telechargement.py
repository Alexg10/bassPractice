"""Étape « téléchargement » du traitement : lien YouTube → audio original d'un morceau."""

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from urllib.parse import parse_qs, urlparse

ETAPE = "téléchargement"
DUREE_MAX_S = 10 * 60

_VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
_HOTES_YOUTUBE = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"}


class EchecTraitement(Exception):
    """Échec d'une étape du traitement, avec un code stable et un message pour l'utilisateur."""

    def __init__(self, etape: str, code: str, message: str):
        super().__init__(message)
        self.etape = etape
        self.code = code
        self.message = message


def _echec(code: str, message: str) -> EchecTraitement:
    return EchecTraitement(ETAPE, code, message)


@dataclass(frozen=True)
class InfosVideo:
    video_id: str
    titre: str
    duree_s: int | None
    """None pour un direct ou une durée que YouTube ne donne pas."""


@dataclass(frozen=True)
class AudioOriginal:
    video_id: str
    titre: str
    duree_s: int
    chemin: Path


class YouTube(Protocol):
    """Accès à YouTube. Lève EchecTraitement pour toute erreur côté YouTube."""

    def infos(self, video_id: str) -> InfosVideo: ...

    def telecharger_audio(self, video_id: str, dossier: Path) -> Path: ...


def video_id_depuis_lien(lien: str) -> str:
    lien = lien.strip()
    if "://" not in lien:
        lien = "https://" + lien
    url = urlparse(lien)
    hote = (url.hostname or "").lower()

    candidat: str | None = None
    if hote == "youtu.be":
        candidat = url.path.lstrip("/").split("/")[0]
    elif hote in _HOTES_YOUTUBE:
        if url.path == "/watch":
            candidat = parse_qs(url.query).get("v", [None])[0]
        elif url.path.startswith(("/shorts/", "/embed/", "/live/")):
            candidat = url.path.split("/")[2]

    if not candidat or not _VIDEO_ID.match(candidat):
        raise _echec("lien_invalide", "Ce lien n'est pas un lien vers une vidéo YouTube.")
    return candidat


def dossier_du_morceau(data_dir: Path, video_id: str) -> Path:
    return data_dir / "morceaux" / video_id


def telecharger_audio_original(lien: str, youtube: YouTube, data_dir: Path) -> AudioOriginal:
    video_id = video_id_depuis_lien(lien)
    infos = youtube.infos(video_id)

    if infos.duree_s is None:
        raise _echec("duree_inconnue", "Impossible de connaître la durée de cette vidéo (direct ?).")
    if infos.duree_s > DUREE_MAX_S:
        raise _echec("trop_long", "Cette vidéo dure plus de 10 minutes.")

    dossier = dossier_du_morceau(data_dir, video_id)
    dossier.mkdir(parents=True, exist_ok=True)
    chemin = youtube.telecharger_audio(video_id, dossier)
    return AudioOriginal(video_id, infos.titre, infos.duree_s, chemin)


def classer_erreur_youtube(message: str) -> EchecTraitement:
    m = message.lower()
    if "confirm your age" in m or "age-restricted" in m or "age restricted" in m:
        return _echec("restriction_age", "Cette vidéo est soumise à une restriction d'âge.")
    if any(s in m for s in ("video unavailable", "video is unavailable", "private video", "not made this video available", "has been removed")):
        return _echec("indisponible", "Cette vidéo est indisponible (privée, supprimée ou bloquée).")
    return _echec("erreur_inconnue", "Le téléchargement depuis YouTube a échoué.")


class _LoggerSilencieux:
    def debug(self, msg: str) -> None: ...

    def warning(self, msg: str) -> None: ...

    def error(self, msg: str) -> None: ...


class YtDlpYouTube:
    """Implémentation réelle, via yt-dlp."""

    _OPTIONS = {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "noplaylist": True,
        "logger": _LoggerSilencieux(),  # les erreurs remontent en EchecTraitement, pas sur stderr
    }

    @staticmethod
    def _url(video_id: str) -> str:
        return f"https://www.youtube.com/watch?v={video_id}"

    def infos(self, video_id: str) -> InfosVideo:
        info = self._extraire(video_id, {"skip_download": True}, download=False)
        duree = None if info.get("is_live") else info.get("duration")
        return InfosVideo(video_id, info.get("title") or video_id, int(duree) if duree else None)

    def telecharger_audio(self, video_id: str, dossier: Path) -> Path:
        options = {"format": "bestaudio/best", "outtmpl": str(dossier / "audio-original.%(ext)s")}
        info = self._extraire(video_id, options, download=True)
        return Path(info["requested_downloads"][0]["filepath"])

    def _extraire(self, video_id: str, options: dict, download: bool) -> dict:
        from yt_dlp import YoutubeDL
        from yt_dlp.utils import DownloadError

        try:
            with YoutubeDL({**self._OPTIONS, **options}) as ydl:
                return ydl.extract_info(self._url(video_id), download=download)
        except DownloadError as e:
            raise classer_erreur_youtube(str(e)) from e
