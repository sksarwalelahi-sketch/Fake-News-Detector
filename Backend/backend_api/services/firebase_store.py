from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import firebase_admin
from firebase_admin import credentials, firestore

from backend_api.config import settings

_db = None
_init_error: Optional[str] = None


def _init_firestore() -> None:
    global _db, _init_error
    if _db is not None:
        return

    try:
        if not firebase_admin._apps:
            cred = credentials.Certificate(settings.firebase_service_account)
            firebase_admin.initialize_app(cred)
        _db = firestore.client()
        _init_error = None
    except ValueError as exc:
        # Common in dev reloads when another module already initialized [DEFAULT].
        # Reuse the existing app instead of failing permanently.
        if 'already exists' in str(exc).lower():
            try:
                _db = firestore.client()
                _init_error = None
                return
            except Exception as nested_exc:
                _init_error = str(nested_exc)
                _db = None
                return
        _init_error = str(exc)
        _db = None
    except Exception as exc:
        _init_error = str(exc)
        _db = None


def now_iso_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_ready() -> bool:
    _init_firestore()
    return _db is not None


def init_error() -> Optional[str]:
    _init_firestore()
    return _init_error


def save_history_record(record: Dict[str, Any]) -> Tuple[bool, Optional[str], Optional[str]]:
    _init_firestore()
    if _db is None:
        return False, _init_error or 'Firestore not initialized.', None

    try:
        payload = dict(record)
        payload['created_at'] = firestore.SERVER_TIMESTAMP
        ref = _db.collection(settings.firestore_collection).add(payload)[1]
        return True, None, ref.id
    except Exception as exc:
        return False, str(exc), None


def list_history(limit: int = 50) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    _init_firestore()
    if _db is None:
        return [], _init_error or 'Firestore not initialized.'

    try:
        query = (
            _db.collection(settings.firestore_collection)
            .order_by('created_at', direction=firestore.Query.DESCENDING)
            .limit(max(1, min(limit, 500)))
        )
        docs = query.stream()

        items: List[Dict[str, Any]] = []
        for doc in docs:
            data = doc.to_dict() or {}
            created_at = data.pop('created_at', None)
            created_at_iso = created_at.isoformat() if hasattr(created_at, 'isoformat') else data.get('createdAt') or now_iso_utc()

            items.append(
                {
                    'id': doc.id,
                    'text': data.get('text', ''),
                    'result': data.get('result', 'Unverified'),
                    'reason': data.get('reason', ''),
                    'similarity': float(data.get('similarity', 0) or 0),
                    'liveNewsSimilarity': float(data.get('liveNewsSimilarity', 0) or 0),
                    'source': data.get('source', ''),
                    'language': data.get('language', 'unknown'),
                    'translationApplied': bool(data.get('translationApplied', False)),
                    'translatedText': data.get('translatedText', data.get('text', '')),
                    'evidence': data.get('evidence', {}),
                    'imageVerification': data.get('imageVerification', {}),
                    'duplicateImage': data.get('duplicateImage', {}),
                    'createdAt': created_at_iso,
                }
            )

        return items, None
    except Exception as exc:
        return [], str(exc)


def clear_history() -> Tuple[int, Optional[str]]:
    _init_firestore()
    if _db is None:
        return 0, _init_error or 'Firestore not initialized.'

    try:
        docs = list(_db.collection(settings.firestore_collection).stream())
        deleted = 0
        for doc in docs:
            doc.reference.delete()
            deleted += 1
        return deleted, None
    except Exception as exc:
        return 0, str(exc)


def delete_history_item(item_id: str) -> Tuple[bool, Optional[str]]:
    _init_firestore()
    if _db is None:
        return False, _init_error or 'Firestore not initialized.'

    try:
        ref = _db.collection(settings.firestore_collection).document(item_id)
        if not ref.get().exists:
            return False, 'History item not found.'
        ref.delete()
        return True, None
    except Exception as exc:
        return False, str(exc)


def find_image_duplicates(
    sha256: str,
    exclude_id: Optional[str] = None,
    limit: int = 10,
) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    _init_firestore()
    if _db is None:
        return [], _init_error or 'Firestore not initialized.'

    needle = str(sha256 or '').strip().lower()
    if not needle:
        return [], None

    try:
        query = _db.collection(settings.firestore_collection).where('imageVerification.sha256', '==', needle)
        docs = query.stream()

        items: List[Dict[str, Any]] = []
        for doc in docs:
            if exclude_id and doc.id == exclude_id:
                continue

            data = doc.to_dict() or {}
            created_at = data.get('created_at')
            created_at_iso = (
                created_at.isoformat()
                if hasattr(created_at, 'isoformat')
                else data.get('createdAt') or now_iso_utc()
            )
            items.append(
                {
                    'id': doc.id,
                    'text': data.get('text', ''),
                    'result': data.get('result', 'Unverified'),
                    'createdAtSort': created_at_iso,
                    'createdAt': created_at_iso,
                    'fileName': ((data.get('imageVerification') or {}).get('fileName') or ''),
                }
            )

        items.sort(key=lambda item: item.get('createdAtSort', ''), reverse=True)
        for item in items:
            item.pop('createdAtSort', None)
        items = items[: max(1, min(limit, 100))]
        return items, None
    except Exception as exc:
        return [], str(exc)
