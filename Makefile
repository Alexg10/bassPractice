PY := server/.venv/bin/python

.PHONY: install dev dev-web dev-server test

install:
	python3 -m venv server/.venv
	$(PY) -m pip install -q -e 'server[dev]'
	cd web && npm install

dev:
	$(MAKE) -j2 dev-server dev-web

dev-server:
	cd server && .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

dev-web:
	cd web && npm run dev

test:
	cd server && .venv/bin/pytest -q
	cd web && npm test && npm run build
