import logging
from concurrent.futures import Executor, ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.bibliotheque import Bibliotheque, Echec, Morceau
from app.settings import DATA_DIR
from app.telechargement import AudioOriginal, YtDlpYouTube, telecharger_audio_original, video_id_depuis_lien
from app.traitement import EchecTraitement

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Etapes:
    """Les étapes du traitement, dans l'ordre. Injectables pour les tests."""

    telecharger: Callable[[str, Path], AudioOriginal]
    separer: Callable[[str, Path], object]
    transcrire: Callable[[str, Path], object]


def etapes_reelles() -> Etapes:
    from app.separation import AudioSeparatorDemucs, separer_pistes
    from app.transcription import transcrire

    youtube = YtDlpYouTube()
    return Etapes(
        telecharger=lambda lien, data_dir: telecharger_audio_original(lien, youtube, data_dir),
        separer=lambda video_id, data_dir: separer_pistes(video_id, AudioSeparatorDemucs(data_dir / "modeles"), data_dir),
        transcrire=transcrire,
    )


def traiter(lien: str, video_id: str, bibliotheque: Bibliotheque, etapes: Etapes, data_dir: Path) -> None:
    etape = "téléchargement"
    try:
        bibliotheque.commencer_etape(video_id, etape)
        audio = etapes.telecharger(lien, data_dir)
        bibliotheque.renseigner(video_id, audio.titre, audio.duree_s)
        for etape, faire in (("séparation", etapes.separer), ("transcription", etapes.transcrire)):
            bibliotheque.commencer_etape(video_id, etape)
            faire(video_id, data_dir)
        bibliotheque.marquer_pret(video_id)
    except EchecTraitement as e:
        bibliotheque.marquer_echec(video_id, Echec(e.etape, e.code, e.message))
    except Exception:
        log.exception("Erreur inattendue pendant l'étape %s de %s", etape, video_id)
        bibliotheque.marquer_echec(video_id, Echec(etape, "erreur_interne", "Une erreur inattendue est survenue."))


class NouveauMorceau(BaseModel):
    lien: str


def _json(m: Morceau) -> dict:
    return asdict(m)


def creer_app(
    data_dir: Path = DATA_DIR,
    etapes: Etapes | None = None,
    execution: Executor | None = None,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        data_dir.mkdir(parents=True, exist_ok=True)
        app.state.bibliotheque = Bibliotheque(data_dir / "bibliotheque.sqlite")
        app.state.bibliotheque.marquer_interrompus()
        app.state.etapes = etapes or etapes_reelles()
        # Un seul traitement à la fois : la séparation de pistes occupe toute la machine.
        app.state.execution = execution or ThreadPoolExecutor(max_workers=1, thread_name_prefix="traitement")
        yield
        if execution is None:
            app.state.execution.shutdown(wait=False, cancel_futures=True)

    app = FastAPI(title="bassPractice", lifespan=lifespan)

    @app.exception_handler(EchecTraitement)
    async def echec_traitement(_: Request, e: EchecTraitement) -> JSONResponse:
        return JSONResponse(status_code=422, content={"etape": e.etape, "code": e.code, "message": e.message})

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/morceaux")
    def lister(request: Request) -> list[dict]:
        return [_json(m) for m in request.app.state.bibliotheque.lister()]

    @app.get("/api/morceaux/{video_id}")
    def obtenir(video_id: str, request: Request) -> dict:
        morceau = request.app.state.bibliotheque.obtenir(video_id)
        if morceau is None:
            raise HTTPException(404, "Morceau inconnu.")
        return _json(morceau)

    @app.post("/api/morceaux")
    def ajouter(corps: NouveauMorceau, request: Request) -> JSONResponse:
        state = request.app.state
        video_id = video_id_depuis_lien(corps.lien)
        existant = state.bibliotheque.obtenir(video_id)
        if existant and existant.statut != "echec":
            return JSONResponse(status_code=200, content=_json(existant))

        state.bibliotheque.ajouter(video_id)
        state.execution.submit(traiter, corps.lien, video_id, state.bibliotheque, state.etapes, data_dir)
        return JSONResponse(status_code=202, content=_json(state.bibliotheque.obtenir(video_id)))

    return app


app = creer_app()
