import os
from pathlib import Path

# Local data folder holding the Bibliothèque (audio files + SQLite). Ignored by git.
DATA_DIR = Path(
    os.environ.get("BASSPRACTICE_DATA_DIR", Path(__file__).resolve().parents[2] / "data")
)
