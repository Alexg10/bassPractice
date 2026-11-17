from concurrent.futures import Executor, Future
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.bibliotheque import Bibliotheque
from app.main import Etapes, creer_app
from app.telechargement import AudioOriginal
from app.traitement import EchecTraitement

VIDEO_ID = "dQw4w9WgXcQ"
LIEN = f"https://youtu.be/{VIDEO_ID}"


class ExecutionImmediate(Executor):
    """Exécute le traitement tout de suite, pour des tests déterministes."""

    def submit(self, fn, /, *args, **kwargs):
        f = Future()
        f.set_result(fn(*args, **kwargs))
        return f


class ExecutionManuelle(Executor):
    """Garde le traitement en attente jusqu'à ce que le test le lance."""

    def __init__(self):
        self.en_attente = []

    def submit(self, fn, /, *args, **kwargs):
        self.en_attente.append(lambda: fn(*args, **kwargs))
        return Future()


class FausseEtapes:
    def __init__(self, echec_a: str | None = None):
        self.appels: list[str] = []
        self.echec_a = echec_a
        self.etapes_vues: list[str | None] = []  # étape affichée par la bibliothèque pendant chaque étape
        self.bibliotheque: Bibliotheque | None = None

    def _etape(self, nom: str, video_id: str):
        self.appels.append(nom)
        if self.bibliotheque:
            self.etapes_vues.append(self.bibliotheque.obtenir(video_id).etape)
        if self.echec_a == nom:
            raise EchecTraitement(nom, "boum", f"Échec pendant {nom}.")

    def etapes(self) -> Etapes:
        def telecharger(lien: str, data_dir: Path) -> AudioOriginal:
            self._etape("téléchargement", VIDEO_ID)
            return AudioOriginal(VIDEO_ID, "Titre du morceau", 213, data_dir / "x.wav")

        return Etapes(
            telecharger=telecharger,
            separer=lambda video_id, data_dir: self._etape("séparation", video_id),
            transcrire=lambda video_id, data_dir: self._etape("transcription", video_id),
        )


@pytest.fixture
def lancer(tmp_path):
    def _lancer(etapes: FausseEtapes | None = None, execution: Executor | None = None):
        etapes = etapes or FausseEtapes()
        app = creer_app(data_dir=tmp_path, etapes=etapes.etapes(), execution=execution or ExecutionImmediate())
        client = TestClient(app)
        client.__enter__()
        etapes.bibliotheque = app.state.bibliotheque
        return client, etapes

    return _lancer


def test_coller_un_lien_traite_le_morceau_et_l_ajoute_a_la_bibliotheque(lancer):
    client, etapes = lancer()

    res = client.post("/api/morceaux", json={"lien": LIEN})

    assert res.status_code == 202
    assert res.json()["video_id"] == VIDEO_ID
    assert etapes.appels == ["téléchargement", "séparation", "transcription"]
    morceau = client.get(f"/api/morceaux/{VIDEO_ID}").json()
    assert morceau["statut"] == "pret"
    assert morceau["titre"] == "Titre du morceau"
    assert morceau["duree_s"] == 213
    assert morceau["etape"] is None


def test_la_progression_suit_les_etapes(lancer):
    client, etapes = lancer()
    client.post("/api/morceaux", json={"lien": LIEN})
    assert etapes.etapes_vues == ["téléchargement", "séparation", "transcription"]


def test_un_morceau_en_attente_est_visible_avant_son_traitement(lancer):
    execution = ExecutionManuelle()
    client, _ = lancer(execution=execution)

    client.post("/api/morceaux", json={"lien": LIEN})

    morceau = client.get(f"/api/morceaux/{VIDEO_ID}").json()
    assert (morceau["statut"], morceau["etape"]) == ("en_cours", None)
    execution.en_attente[0]()
    assert client.get(f"/api/morceaux/{VIDEO_ID}").json()["statut"] == "pret"


def test_recoller_le_lien_d_un_morceau_existant_le_rouvre_sans_retraitement(lancer):
    client, etapes = lancer()
    client.post("/api/morceaux", json={"lien": LIEN})

    res = client.post("/api/morceaux", json={"lien": f"https://www.youtube.com/watch?v={VIDEO_ID}&t=10"})

    assert res.status_code == 200
    assert res.json()["statut"] == "pret"
    assert etapes.appels.count("téléchargement") == 1


def test_un_echec_est_enregistre_avec_son_etape(lancer):
    client, _ = lancer(FausseEtapes(echec_a="séparation"))

    client.post("/api/morceaux", json={"lien": LIEN})

    morceau = client.get(f"/api/morceaux/{VIDEO_ID}").json()
    assert morceau["statut"] == "echec"
    assert morceau["echec"] == {"etape": "séparation", "code": "boum", "message": "Échec pendant séparation."}


def test_une_erreur_inattendue_est_un_echec_de_l_etape_en_cours(lancer):
    etapes = FausseEtapes()
    client, _ = lancer(etapes)
    original = etapes._etape

    def plante(nom, video_id):
        original(nom, video_id)
        if nom == "transcription":
            raise ZeroDivisionError

    etapes._etape = plante
    client.post("/api/morceaux", json={"lien": LIEN})

    echec = client.get(f"/api/morceaux/{VIDEO_ID}").json()["echec"]
    assert (echec["etape"], echec["code"]) == ("transcription", "erreur_interne")


def test_recoller_le_lien_apres_un_echec_relance_le_traitement(lancer):
    etapes = FausseEtapes(echec_a="séparation")
    client, _ = lancer(etapes)
    client.post("/api/morceaux", json={"lien": LIEN})
    etapes.echec_a = None

    res = client.post("/api/morceaux", json={"lien": LIEN})

    assert res.status_code == 202
    assert client.get(f"/api/morceaux/{VIDEO_ID}").json()["statut"] == "pret"


def test_un_lien_invalide_est_refuse_sans_rien_creer(lancer):
    client, etapes = lancer()

    res = client.post("/api/morceaux", json={"lien": "https://open.spotify.com/track/x"})

    assert res.status_code == 422
    assert res.json()["code"] == "lien_invalide"
    assert client.get("/api/morceaux").json() == []
    assert etapes.appels == []


def test_la_bibliotheque_liste_les_morceaux_du_plus_recent_au_plus_ancien(lancer):
    client, _ = lancer()
    for vid in ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"]:
        client.post("/api/morceaux", json={"lien": f"https://youtu.be/{vid}"})

    assert [m["video_id"] for m in client.get("/api/morceaux").json()] == ["ccccccccccc", "bbbbbbbbbbb", "aaaaaaaaaaa"]


def test_un_morceau_inconnu_renvoie_404(lancer):
    client, _ = lancer()
    assert client.get("/api/morceaux/zzzzzzzzzzz").status_code == 404


def test_la_bibliotheque_survit_a_un_redemarrage(tmp_path):
    Bibliotheque(tmp_path / "bibliotheque.sqlite").ajouter(VIDEO_ID)
    assert Bibliotheque(tmp_path / "bibliotheque.sqlite").obtenir(VIDEO_ID) is not None


def test_un_traitement_interrompu_par_un_redemarrage_est_marque_en_echec(tmp_path):
    biblio = Bibliotheque(tmp_path / "bibliotheque.sqlite")
    biblio.ajouter(VIDEO_ID)
    biblio.commencer_etape(VIDEO_ID, "séparation")

    Bibliotheque(tmp_path / "bibliotheque.sqlite").marquer_interrompus()

    morceau = Bibliotheque(tmp_path / "bibliotheque.sqlite").obtenir(VIDEO_ID)
    assert morceau.statut == "echec"
    assert (morceau.echec.etape, morceau.echec.code) == ("séparation", "interrompu")


# --- Tablature et pistes d'un morceau prêt ------------------------------------------------


@pytest.fixture
def morceau_pret(lancer, tmp_path):
    import json

    from app.traitement import dossier_du_morceau

    client, _ = lancer()
    client.post("/api/morceaux", json={"lien": LIEN})
    dossier = dossier_du_morceau(tmp_path, VIDEO_ID)
    dossier.mkdir(parents=True, exist_ok=True)
    (dossier / "tablature.json").write_text(json.dumps({"grille": {"tempo": 100}, "mesures": []}))
    (dossier / "piste-basse.wav").write_bytes(b"RIFF-basse")
    (dossier / "backing-track.wav").write_bytes(b"RIFF-backing")
    return client


def test_renvoie_la_tablature_d_un_morceau(morceau_pret):
    res = morceau_pret.get(f"/api/morceaux/{VIDEO_ID}/tablature")
    assert res.status_code == 200
    assert res.json()["grille"]["tempo"] == 100


@pytest.mark.parametrize(("piste", "contenu"), [("piste-basse", b"RIFF-basse"), ("backing-track", b"RIFF-backing")])
def test_sert_les_pistes_audio(morceau_pret, piste, contenu):
    res = morceau_pret.get(f"/api/morceaux/{VIDEO_ID}/pistes/{piste}")
    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/wav"
    assert res.content == contenu


def test_les_pistes_audio_acceptent_les_requetes_partielles(morceau_pret):
    # Nécessaire pour que le navigateur puisse se déplacer dans l'audio.
    res = morceau_pret.get(f"/api/morceaux/{VIDEO_ID}/pistes/piste-basse", headers={"Range": "bytes=0-3"})
    assert res.status_code == 206
    assert res.content == b"RIFF"


@pytest.mark.parametrize("piste", ["audio-original", "tablature", "..%2F..%2Fbibliotheque.sqlite"])
def test_ne_sert_que_les_deux_pistes_de_pratique(morceau_pret, piste):
    assert morceau_pret.get(f"/api/morceaux/{VIDEO_ID}/pistes/{piste}").status_code == 404


def test_tablature_et_pistes_d_un_morceau_inconnu_renvoient_404(lancer):
    client, _ = lancer()
    assert client.get("/api/morceaux/zzzzzzzzzzz/tablature").status_code == 404
    assert client.get("/api/morceaux/zzzzzzzzzzz/pistes/piste-basse").status_code == 404


# --- Enregistrement des corrections -------------------------------------------------------

TAB_VALIDE = {
    "grille": {"tempo": 98.5, "premiere_mesure_s": 0.62, "signature": [4, 4]},
    "mesures": [
        {
            "evenements": [
                {"type": "note", "hauteur": 33, "duree": 4, "position": {"corde": 2, "frette": 0}},
                {"type": "note", "hauteur": 26, "duree": 4, "position": None},
                {"type": "silence", "duree": 8},
            ]
        }
    ],
}


def test_enregistre_une_tablature_corrigee(morceau_pret):
    res = morceau_pret.put(f"/api/morceaux/{VIDEO_ID}/tablature", json=TAB_VALIDE)

    assert res.status_code == 204
    relue = morceau_pret.get(f"/api/morceaux/{VIDEO_ID}/tablature").json()
    assert relue["grille"]["tempo"] == 98.5
    assert relue["mesures"][0]["evenements"][0]["position"] == {"corde": 2, "frette": 0}


def _modifiee(**changements):
    import copy

    tab = copy.deepcopy(TAB_VALIDE)
    evts = tab["mesures"][0]["evenements"]
    if "duree" in changements:
        evts[2]["duree"] = changements["duree"]
    if "position" in changements:
        evts[0]["position"] = changements["position"]
    if "tempo" in changements:
        tab["grille"]["tempo"] = changements["tempo"]
    return tab


@pytest.mark.parametrize(
    "tab",
    [
        _modifiee(duree=4),  # la mesure ne fait plus 16 doubles croches
        _modifiee(duree=5),  # durée non notable
        _modifiee(position={"corde": 2, "frette": 3}),  # position incohérente avec la hauteur (33)
        _modifiee(position={"corde": 5, "frette": 0}),  # corde inexistante
        _modifiee(tempo=0),
        {"grille": {"tempo": 100}},
    ],
)
def test_refuse_une_tablature_invalide_sans_toucher_a_l_existante(morceau_pret, tab):
    avant = morceau_pret.get(f"/api/morceaux/{VIDEO_ID}/tablature").json()

    res = morceau_pret.put(f"/api/morceaux/{VIDEO_ID}/tablature", json=tab)

    assert res.status_code == 422
    assert morceau_pret.get(f"/api/morceaux/{VIDEO_ID}/tablature").json() == avant


def test_n_enregistre_pas_la_tablature_d_un_morceau_inconnu(lancer):
    client, _ = lancer()
    assert client.put("/api/morceaux/zzzzzzzzzzz/tablature", json=TAB_VALIDE).status_code == 404
