# Backend Architecture

This backend merges:
- Team backend service flow (`legacy/app1.py` kept for reference)
- AIML fake-news engine
- Firebase Firestore history storage

## Final Structure

- `app.py`: thin entrypoint (run this)
- `backend_api/`
  - `__init__.py`: app factory
  - `config.py`: central settings/env loading
  - `routes/api.py`: API routes (`/health`, `/check-news`, `/history`)
  - `services/ai_engine.py`: fake-news detection engine (translation + fact-check + similarity)
  - `services/firebase_store.py`: Firestore save/load/clear history
- `data/`
  - `official_registry.json`: external entity/domain registry (large, editable without code changes)
  - `official_cache.db`: persistent retrieval cache (auto-created at runtime)
- `scripts/`
  - `generate_official_registry.py`: regenerates large registry file
- `ai_engine_py.py`: backward-compatible wrapper import
- `firebase_store.py`: backward-compatible wrapper import
- `legacy/app1.py`: previous backend implementation (reference only)
- `.env`: environment values
- `serviceAccountKey.json`: Firebase Admin service account key

## Environment

Create/update `Backend/.env`:

```env
GOOGLE_FACT_CHECK_API_KEY=YOUR_GOOGLE_FACTCHECK_KEY
FIREBASE_SERVICE_ACCOUNT=serviceAccountKey.json
FIRESTORE_COLLECTION=analysis_history
FLASK_HOST=0.0.0.0
PORT=5000
FLASK_DEBUG=true
OFFICIAL_REGISTRY_PATH=data/official_registry.json
OFFICIAL_CACHE_DB_PATH=data/official_cache.db
OFFICIAL_CACHE_TTL_SECONDS=21600
MAX_OFFICIAL_ENTITIES=4
MAX_DOMAINS_PER_ENTITY=2
```

Notes:
- If `FIREBASE_SERVICE_ACCOUNT` is omitted, backend defaults to `Backend/serviceAccountKey.json`.
- Keep `.env` in UTF-8 without BOM.
- `OFFICIAL_REGISTRY_PATH` can point to any JSON file path.
- Cache DB is used for search/page/entity-discovery results to reduce latency.

## Install

```powershell
cd C:\Users\TUF\OneDrive\Desktop\Hackforge\Backend
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## Run

```powershell
python app.py
```

## Registry Management

Regenerate/update the large external registry:

```powershell
cd Backend
.\.venv\Scripts\python.exe scripts\generate_official_registry.py
```

This writes `Backend/data/official_registry.json` (thousands of entries).
You can also edit that JSON directly to add/remove entities/domains without code changes.

## Async Retrieval + Caching

- Official-source retrieval runs in parallel workers to reduce response time.
- Fact-check fetch, official retrieval, and live news fetch are executed concurrently.
- Persistent cache (`official_cache.db`) stores:
  - entity-domain discovery
  - official search results
  - page summaries
  - aggregated official context

## API Endpoints

### `GET /health`
Returns backend, API key, and Firebase status.

### `POST /check-news`
Body:
```json
{ "text": "Your news text" }
```
Response includes analysis + stored history item metadata.

### `GET /history?limit=50`
Returns history list from Firestore ordered newest first.

### `DELETE /history`
Clears all records in configured Firestore collection.

### `DELETE /history/<item_id>`
Deletes one specific history record by id.

## Frontend Integration

Frontend calls backend using:
- `REACT_APP_API_BASE_URL` (default: `http://127.0.0.1:5000`)
- Analyze: `POST /check-news`
- History load: `GET /history`
- History clear: `DELETE /history`

## Legacy File

- `legacy/app1.py` is preserved for reference only.
- Do not run `legacy/app1.py` unless specifically needed for comparison/debug.
