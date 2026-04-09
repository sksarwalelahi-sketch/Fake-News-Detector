import os
import re
from datetime import datetime, timezone
from typing import Optional, Tuple, List, Dict, Any

import requests
from flask import Flask, jsonify, request

# Firebase Admin SDK (Firestore)
import firebase_admin
from firebase_admin import credentials, firestore


# -----------------------------
# Configuration (easy to tweak)
# -----------------------------
SERVICE_ACCOUNT_PATH = os.getenv("FIREBASE_SERVICE_ACCOUNT", "serviceAccountKey.json")
FIRESTORE_COLLECTION = "messages"

# LibreTranslate (free/self-hosted). Public instances may have limits or be down.
LIBRETRANSLATE_URL = os.getenv("LIBRETRANSLATE_URL", "https://libretranslate.de")
LIBRETRANSLATE_API_KEY = os.getenv("LIBRETRANSLATE_API_KEY", "")  # optional

# Keep things fast for hackathon demos
HTTP_TIMEOUT = (1.0, 1.5)  # (connect, read) seconds
MAX_TEXT_LENGTH = int(os.getenv("MAX_TEXT_LENGTH", "5000"))


app = Flask(__name__)


# -----------------------------
# Firebase initialization
# -----------------------------
db = None
firebase_init_error = None

try:
    if not firebase_admin._apps:
        cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
        firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as exc:
    # App can still run, but Firestore operations will fail with a clear error.
    firebase_init_error = str(exc)
    db = None


# -----------------------------
# Helper utilities
# -----------------------------
def now_iso_utc() -> str:
    """UTC timestamp in ISO format (string) for API response + Firestore."""
    return datetime.now(timezone.utc).isoformat()


def json_error(message: str, status_code: int = 400, details=None):
    payload = {"error": {"message": message}}
    if details is not None:
        payload["error"]["details"] = details
    return jsonify(payload), status_code


def normalize_text(text: str) -> str:
    """Basic cleanup for scoring (does not change meaning)."""
    text = text.strip()
    # Collapse repeated spaces
    return re.sub(r"\s+", " ", text)


def detect_language(text: str) -> Optional[str]:
    """
    Best-effort language detection:
    1) Try LibreTranslate /detect (fast, no extra library).
    2) Fallback to langdetect (if installed).
    Returns language code like 'en', 'hi', etc., or None if unknown.
    """
    cleaned = normalize_text(text)
    if not cleaned:
        return None

    # 1) LibreTranslate detect
    try:
        resp = requests.post(
            f"{LIBRETRANSLATE_URL.rstrip('/')}/detect",
            data={"q": cleaned, "api_key": LIBRETRANSLATE_API_KEY},
            timeout=HTTP_TIMEOUT,
        )
        if resp.ok:
            data = resp.json()
            # Typical shape: [[{"language":"en","confidence":0.99}, ...]]
            if isinstance(data, list) and data and isinstance(data[0], list) and data[0]:
                top = data[0][0]
                if isinstance(top, dict) and top.get("language"):
                    return str(top["language"])
    except Exception:
        pass

    # 2) Optional fallback: langdetect (install only if you want it)
    try:
        from langdetect import detect  # type: ignore

        return detect(cleaned)
    except Exception:
        return None


def translate_to_english(text: str, source_lang=None):
    try:
        url = "https://libretranslate.de/translate"
        payload = {
            "q": text,
            "source": "auto",
            "target": "en",
            "format": "text"
        }

        response = requests.post(url, json=payload, timeout=3)

        if response.status_code == 200:
            data = response.json()
            translated = data.get("translatedText")
            if translated:
                return translated, source_lang, None

        # fallback if API fails
        return text, source_lang, "Translation API unavailable"

    except Exception as e:
        return text, source_lang, "Translation API unavailable"


def fake_news_score(english_text: str):
    text = normalize_text(english_text)
    lowered = text.lower()

    suspicious_keywords = [
        "cure", "miracle", "guarantee", "100%", "secret",
        "urgent", "forward this", "share this", "breaking",
        "shocking", "they don't want you to know"
    ]

    credible_keywords = [
        "who", "cdc", "research", "study", "scientific",
        "official", "government", "hospital"
    ]

    triggered = []
    score = 0.0

    # Suspicious detection
    for kw in suspicious_keywords:
        if kw in lowered:
            score += 0.2
            triggered.append(f"Suspicious claim: '{kw}'")

    # Credible signals
    for kw in credible_keywords:
        if kw in lowered:
            score -= 0.15
            triggered.append(f"Credible reference: '{kw}'")

    # Extra logic
    if "!" in text:
        score += 0.05
        triggered.append("Emotional tone detected")

    if "http" not in lowered:
        score += 0.1
        triggered.append("No trusted source link")

    # Final decision
    fake_prob = max(0.0, min(1.0, 0.5 + score))
    result = "Fake" if fake_prob >= 0.5 else "Real"

    # 🔥 Improved confidence
    confidence = max(0.6, abs(fake_prob - 0.5) * 2)

    # 🔥 Strong explanation
    if result == "Fake":
        explanation = (
            "This message shows characteristics of misinformation.\n"
            + "\n".join(f"- {t}" for t in triggered) +
            "\n\nSuch patterns are commonly found in fake or misleading claims."
        )
    else:
        explanation = (
            "This message appears relatively reliable.\n"
            + "\n".join(f"- {t}" for t in triggered)
        )

    return result, round(confidence, 2), explanation


def save_to_firestore(record: Dict[str, Any]):
    """Save a record to Firestore (collection: messages). Raises on failure."""
    if db is None:
        raise RuntimeError(
            "Firestore not initialized. Check serviceAccountKey.json and FIREBASE_SERVICE_ACCOUNT."
            + (f" Init error: {firebase_init_error}" if firebase_init_error else "")
        )
    # Add a server-side timestamp for easier sorting
    record_with_server_ts = dict(record)
    record_with_server_ts["created_at"] = firestore.SERVER_TIMESTAMP
    db.collection(FIRESTORE_COLLECTION).add(record_with_server_ts)


def load_history(limit: Optional[int] = None) -> List[Dict[str, Any]]:
    """Load stored messages from Firestore."""
    if db is None:
        raise RuntimeError(
            "Firestore not initialized. Check serviceAccountKey.json and FIREBASE_SERVICE_ACCOUNT."
            + (f" Init error: {firebase_init_error}" if firebase_init_error else "")
        )

    query = db.collection(FIRESTORE_COLLECTION).order_by("created_at", direction=firestore.Query.DESCENDING)
    if limit:
        query = query.limit(int(limit))
    docs = query.stream()
    items = []
    for doc in docs:
        data = doc.to_dict() or {}
        data["id"] = doc.id
        # Firestore server timestamp is not JSON serializable; keep API response clean
        data.pop("created_at", None)
        items.append(data)
    return items


# -----------------------------
# Routes
# -----------------------------
@app.get("/health")
def health():
    return jsonify(
        {
            "status": "ok",
            "firebase": "ok" if db is not None else "error",
            "firebase_error": firebase_init_error,
            "libretranslate_url": LIBRETRANSLATE_URL,
            "timestamp": now_iso_utc(),
        }
    )


@app.post("/analyze")
def analyze():
    data = request.get_json(silent=True) or {}
    text = data.get("text")

    if text is None:
        return json_error("Missing required field: 'text'", 400)
    if not isinstance(text, str):
        return json_error("'text' must be a string", 400)

    text = text.strip()
    if not text:
        return json_error("'text' cannot be empty", 400)
    if len(text) > MAX_TEXT_LENGTH:
        return json_error(f"'text' is too long (max {MAX_TEXT_LENGTH} characters)", 413)

    timestamp = now_iso_utc()

    translated_text, detected_lang, translation_error = translate_to_english(text)
    result, confidence, explanation = fake_news_score(translated_text)

    if translation_error:
        explanation += "\n\nNote: Original text used (translation unavailable)."

    record = {
        "original_text": text,
        "translated_text": translated_text,
        "language": detected_lang,
        "result": result,
        "confidence": confidence,
        "explanation": explanation,
        "timestamp": timestamp,
    }

    # Store in Firestore (best effort)
    try:
        save_to_firestore(record)
    except Exception as exc:
        # Do not fail the main user flow if DB is temporarily down; return analysis anyway.
        record["firestore_saved"] = False
        record["firestore_error"] = str(exc)
        return jsonify(record), 200

    record["firestore_saved"] = True
    return jsonify(record), 200


@app.get("/history")
def history():
    limit_raw = request.args.get("limit")
    limit: Optional[int] = None
    if limit_raw:
        try:
            limit = int(limit_raw)
        except ValueError:
            return json_error("'limit' must be an integer", 400)
    try:
        items = load_history(limit=limit)
        return jsonify({"count": len(items), "items": items}), 200
    except Exception as exc:
        return json_error("Failed to load history from Firestore", 500, details=str(exc))


if __name__ == "__main__":
    # Run locally on port 5000 as requested.
    host = os.getenv("FLASK_HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "5000"))
    app.run(host=host, port=port, debug=True)
