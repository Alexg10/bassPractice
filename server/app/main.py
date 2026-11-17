from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.settings import DATA_DIR
from app.telechargement import EchecTraitement, YouTube, YtDlpYouTube, telecharger_audio_original


@asynccontextmanager
async def lifespan(_: FastAPI):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="bassPractice", lifespan=lifespan)


def get_youtube() -> YouTube:
    return YtDlpYouTube()


def get_data_dir():
    return DATA_DIR


@app.exception_handler(EchecTraitement)
async def echec_traitement(_: Request, e: EchecTraitement) -> JSONResponse:
    return JSONResponse(status_code=422, content={"etape": e.etape, "code": e.code, "message": e.message})


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


class NouveauMorceau(BaseModel):
    lien: str


class MorceauCree(BaseModel):
    video_id: str
    titre: str
    duree_s: int


@app.post("/api/morceaux", status_code=201)
def creer_morceau(
    corps: NouveauMorceau,
    youtube: YouTube = Depends(get_youtube),
    data_dir=Depends(get_data_dir),
) -> MorceauCree:
    # Synchrone pour l'instant : le traitement en tâche de fond arrive avec la bibliothèque (#5).
    audio = telecharger_audio_original(corps.lien, youtube, data_dir)
    return MorceauCree(video_id=audio.video_id, titre=audio.titre, duree_s=audio.duree_s)
