# bassPractice

App pour apprendre la basse : rechercher un morceau ou coller un lien Spotify/YouTube,
récupérer la ligne de basse et la jouer en tablature (à la Guitar Pro).

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues on Alexg10/bassPractice (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root, created lazily. See `docs/agents/domain.md`.

## Dev

- Prérequis : Python ≥ 3.12, Node, `ffmpeg` (`brew install ffmpeg`).
- `make install` : venv Python dans `server/.venv` + `npm install` dans `web/`.
- `make dev` : FastAPI sur :8000 + Vite sur :5173 (proxy `/api` → serveur).
- `make test` : pytest côté serveur + vitest et build TypeScript côté web.
- La bibliothèque locale vit dans `data/` (ignoré par git, surchargeable via `BASSPRACTICE_DATA_DIR`).
