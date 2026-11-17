from pathlib import Path

import pytest

from app.telechargement import (
    DUREE_MAX_S,
    EchecTraitement,
    InfosVideo,
    classer_erreur_youtube,
    telecharger_audio_original,
    video_id_depuis_lien,
)


class FakeYouTube:
    def __init__(self, infos: InfosVideo | None = None, echec: EchecTraitement | None = None):
        self._infos = infos
        self._echec = echec
        self.telechargements: list[str] = []

    def infos(self, video_id: str) -> InfosVideo:
        if self._echec:
            raise self._echec
        assert self._infos is not None
        return self._infos

    def telecharger_audio(self, video_id: str, dossier: Path) -> Path:
        self.telechargements.append(video_id)
        chemin = dossier / "audio-original.m4a"
        chemin.write_bytes(b"audio")
        return chemin


# --- Lien → identifiant de vidéo -----------------------------------------------------------


@pytest.mark.parametrize(
    "lien",
    [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123",
        "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ?si=abc",
        "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
        "  youtube.com/watch?v=dQw4w9WgXcQ  ",
    ],
)
def test_extrait_l_identifiant_de_la_video(lien):
    assert video_id_depuis_lien(lien) == "dQw4w9WgXcQ"


@pytest.mark.parametrize(
    "lien",
    [
        "",
        "pas un lien",
        "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
        "https://www.youtube.com/playlist?list=PL123",
        "https://www.youtube.com/watch?v=trop-court",
        "https://evil.example.com/watch?v=dQw4w9WgXcQ",
    ],
)
def test_refuse_un_lien_qui_n_est_pas_une_video_youtube(lien):
    with pytest.raises(EchecTraitement) as e:
        video_id_depuis_lien(lien)
    assert e.value.etape == "téléchargement"
    assert e.value.code == "lien_invalide"


# --- Téléchargement ----------------------------------------------------------------------


def test_telecharge_l_audio_original_dans_le_dossier_du_morceau(tmp_path):
    youtube = FakeYouTube(InfosVideo("dQw4w9WgXcQ", "Never Gonna Give You Up", 213))

    audio = telecharger_audio_original("https://youtu.be/dQw4w9WgXcQ", youtube, tmp_path)

    assert audio.video_id == "dQw4w9WgXcQ"
    assert audio.titre == "Never Gonna Give You Up"
    assert audio.duree_s == 213
    assert audio.chemin == tmp_path / "morceaux" / "dQw4w9WgXcQ" / "audio-original.m4a"
    assert audio.chemin.read_bytes() == b"audio"


def test_refuse_une_video_de_plus_de_10_minutes_sans_la_telecharger(tmp_path):
    youtube = FakeYouTube(InfosVideo("dQw4w9WgXcQ", "Long", DUREE_MAX_S + 1))

    with pytest.raises(EchecTraitement) as e:
        telecharger_audio_original("https://youtu.be/dQw4w9WgXcQ", youtube, tmp_path)

    assert e.value.code == "trop_long"
    assert youtube.telechargements == []


def test_accepte_une_video_de_10_minutes_pile(tmp_path):
    youtube = FakeYouTube(InfosVideo("dQw4w9WgXcQ", "Pile", DUREE_MAX_S))
    telecharger_audio_original("https://youtu.be/dQw4w9WgXcQ", youtube, tmp_path)
    assert youtube.telechargements == ["dQw4w9WgXcQ"]


def test_refuse_une_video_sans_duree_connue_comme_un_direct(tmp_path):
    youtube = FakeYouTube(InfosVideo("dQw4w9WgXcQ", "Live", None))

    with pytest.raises(EchecTraitement) as e:
        telecharger_audio_original("https://youtu.be/dQw4w9WgXcQ", youtube, tmp_path)

    assert e.value.code == "duree_inconnue"
    assert youtube.telechargements == []


def test_propage_l_echec_signale_par_youtube(tmp_path):
    youtube = FakeYouTube(echec=EchecTraitement("téléchargement", "indisponible", "Vidéo indisponible."))

    with pytest.raises(EchecTraitement) as e:
        telecharger_audio_original("https://youtu.be/dQw4w9WgXcQ", youtube, tmp_path)

    assert e.value.code == "indisponible"


# --- Classement des erreurs de yt-dlp ----------------------------------------------------


@pytest.mark.parametrize(
    ("message", "code"),
    [
        ("ERROR: [youtube] abc: Video unavailable", "indisponible"),
        ("ERROR: [youtube] abc: This video is unavailable", "indisponible"),
        ("ERROR: [youtube] abc: Video unavailable. This video has been removed by the uploader", "indisponible"),
        ("ERROR: [youtube] abc: Private video. Sign in if you've been granted access", "indisponible"),
        ("ERROR: [youtube] abc: Sign in to confirm your age. This video may be inappropriate", "restriction_age"),
        ("ERROR: [youtube] abc: This video is age-restricted", "restriction_age"),
        ("ERROR: [youtube] abc: The uploader has not made this video available in your country", "indisponible"),
        ("ERROR: unable to download video data: HTTP Error 403: Forbidden", "erreur_inconnue"),
    ],
)
def test_classe_les_erreurs_de_youtube(message, code):
    assert classer_erreur_youtube(message).code == code
