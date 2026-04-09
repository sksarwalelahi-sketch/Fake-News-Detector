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
```

Notes:
- If `FIREBASE_SERVICE_ACCOUNT` is omitted, backend defaults to `Backend/serviceAccountKey.json`.
- Keep `.env` in UTF-8 without BOM.

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
