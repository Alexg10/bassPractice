import pytest
from fastapi.testclient import TestClient

from app.main import app, get_data_dir, get_youtube
from app.telechargement import InfosVideo
from tests.test_telechargement import FakeYouTube


@pytest.fixture
def client(tmp_path):
    def utiliser(youtube):
        app.dependency_overrides[get_youtube] = lambda: youtube
        app.dependency_overrides[get_data_dir] = lambda: tmp_path
        return TestClient(app)

    yield utiliser
    app.dependency_overrides.clear()


def test_creer_un_morceau_depuis_un_lien_youtube(client, tmp_path):
    res = client(FakeYouTube(InfosVideo("dQw4w9WgXcQ", "Titre", 213))).post(
        "/api/morceaux", json={"lien": "https://youtu.be/dQw4w9WgXcQ"}
    )
    assert res.status_code == 201
    assert res.json() == {"video_id": "dQw4w9WgXcQ", "titre": "Titre", "duree_s": 213}
    assert (tmp_path / "morceaux" / "dQw4w9WgXcQ" / "audio-original.m4a").exists()


def test_un_echec_indique_l_etape_et_un_message_clair(client):
    res = client(FakeYouTube()).post("/api/morceaux", json={"lien": "https://open.spotify.com/track/x"})
    assert res.status_code == 422
    assert res.json() == {
        "etape": "téléchargement",
        "code": "lien_invalide",
        "message": "Ce lien n'est pas un lien vers une vidéo YouTube.",
    }
