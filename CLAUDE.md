# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Data dashboard platform for the FioCruz Census of the Health Workforce (CensoFTS). Three HTML dashboards consume a Node.js/Express REST API backed by a remote PostgreSQL database.

## Development Commands

All commands run from `APIv1-0/fiocruz-api/`:

```bash
npm install        # Install dependencies
npm start          # Start API server (port 3000)
npm run dev        # Start with nodemon (auto-reload on file changes)
npm run inspect    # Inspect remote database schema
bash test-api.sh   # Run API endpoint smoke tests
```

Frontend is static HTML — open directly in browser or serve via any static server. Update `api-config.js` (root level) `BASE_URL` to point to the running API.

## Architecture

```
Paineis - CensoFTS/
├── APIv1-0/fiocruz-api/   # Express backend
│   ├── server.js           # All routes and DB logic (~1800 lines)
│   ├── .env                # DB credentials and PORT
│   └── .env.example        # Template for .env
├── painel_estabelecimentos.html  # Establishments panel
├── painel_vinculos.html          # Employment links panel
├── painel_resolucao.html         # Resolutions panel
├── api-config.js                 # Frontend: API base URL + fetchWithRetry()
├── censo-fts-design-system.css   # Shared CSS design system
└── front/                        # Integration helpers and migration scripts
```

### Backend (`server.js`)

Single-file Express app. All route handlers, SQL queries, and helper functions live here. Key patterns:

- **WHERE clause builders**: `buildEstabelecimentosWhere()`, `buildVinculosWhere()` etc. — build parameterized SQL from query params. Modify these when adding new filters.
- **Parallel aggregation**: `/api/vinculos/agregados` fires 11 queries via `Promise.all()` — one query per chart dimension (gender, race, education, CBO, CINE, etc.).
- **Connection pool**: 40 max connections, 120s query timeout, 60s idle timeout — configured at the top of `server.js`.

### Database (PostgreSQL, schema `censo`)

| Table | Panel | Key columns |
|---|---|---|
| `recenseamento` | Establishments | `co_cnes`, `sg_uf`, `esfera`, `situacao_recenseamento`, `recenseador` |
| `vinculos` | Employment Links | `nu_cpf`, `co_cnes`, `co_cbo_ocupacao`, `co_sexo`, `ds_raca_cor`, `ds_escolaridade`, `ds_cine` |
| `espelho_cnes` | Resolutions | `co_cpf`, `co_cnes`, `nu_comp`, `st_resolvido`, `tipo_divergencia` |

Gender encoding: `M`/`F` in `vinculos` maps to `1`/`2` in `espelho_cnes` — the WHERE builder handles this translation.

### Frontend

Each panel (`painel_*.html`) uses:
- **Chart.js 4.4.1** for visualizations
- **Select2** for large filter dropdowns
- **`api-config.js`** — `apiRequest()` wrapper with timeout and retry logic
- Loading overlay + error container components (see `front/LOADING-COMPONENTS.html` for reusable snippets)

### API Endpoint Groups

- `/api/estabelecimentos/*` — stats, por-situacao, por-uf, por-esfera, por-macro, por-regional, por-recenseador, lista, filtros
- `/api/vinculos/*` — stats, agregados, tabela, filtros, nao-alterados
- `/api/resolucao/*` — stats, agregados, dados, filtros, tabela
- `GET /health` — DB connection check

## Environment Config

`APIv1-0/fiocruz-api/.env`:
```
DB_HOST=177.85.162.132
DB_PORT=54329
DB_NAME=db_dataware
DB_USER=usr_censo
DB_PASSWORD=agsus@censo
PORT=3000
```

## Production Deployment

Recommended: PM2 + Nginx reverse proxy. See `APIv1-0/fiocruz-api/ARQUITETURA.md` for full Nginx config with SSL and rate limiting. After deploy, update `BASE_URL` in root `api-config.js` to the production URL.

Python script `front/modificar-paineis.py` can automate bulk modifications to panel HTML files.
