from flask import Blueprint, jsonify, request

from backend_api.services.ai_engine import check_fake_news, get_api_key, get_official_registry_stats
from backend_api.services.image_verification import verify_image_news
from backend_api.services.firebase_store import (
    clear_history,
    delete_history_item,
    find_image_duplicates,
    init_error,
    is_ready,
    list_history,
    now_iso_utc,
    save_history_record,
)

api_bp = Blueprint('api', __name__)
_ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/webp'}
_MAX_IMAGE_BYTES = 8 * 1024 * 1024
_VALID_RECENCY_MODES = {'all-time', 'one-week'}


def _normalize_recency_mode(value: str) -> str:
    normalized = str(value or '').strip().lower()
    if normalized in {'week', '7d', '7-days', 'last-7-days', 'last7days'}:
        return 'one-week'
    if normalized in _VALID_RECENCY_MODES:
        return normalized
    return 'all-time'


@api_bp.get('/health')
def health():
    official_stats = get_official_registry_stats()
    return jsonify(
        {
            'status': 'ok',
            'fact_check_api_key_configured': bool(get_api_key()),
            'firebase_ready': is_ready(),
            'firebase_error': init_error(),
            'official_registry': official_stats,
        }
    ), 200


@api_bp.post('/check-news')
def check_news():
    payload = request.get_json(silent=True) or {}
    text = str(payload.get('text', '')).strip()
    demo_preset_id = str(payload.get('demoPresetId', '')).strip()
    recency_mode = _normalize_recency_mode(str(payload.get('recencyMode', 'all-time')))

    if not text:
        return jsonify({'error': "'text' is required."}), 400

    result = check_fake_news(text, demo_preset_id=demo_preset_id, recency_mode=recency_mode)

    history_item = {
        'text': text,
        'result': result.get('label', 'Unverified'),
        'reason': result.get('reason', ''),
        'similarity': float(result.get('similarity', 0) or 0),
        'factCheckSimilarity': float(result.get('factCheckSimilarity', 0) or 0),
        'liveNewsSimilarity': float(result.get('liveNewsSimilarity', 0) or 0),
        'officialContextSimilarity': float(result.get('officialContextSimilarity', 0) or 0),
        'officialContextRelevance': float(result.get('officialContextRelevance', 0) or 0),
        'socialContextSimilarity': float(result.get('socialContextSimilarity', 0) or 0),
        'source': result.get('source', ''),
        'language': result.get('language', 'unknown'),
        'translationApplied': bool(result.get('translationApplied', False)),
        'translatedText': result.get('translatedText', text),
        'recencyMode': result.get('recencyMode', recency_mode),
        'evidence': result.get('evidence', {}),
        'createdAt': now_iso_utc(),
    }

    saved, save_error, record_id = save_history_record(history_item)
    if saved:
        history_item['id'] = record_id

    image_sha = str(result.get('imageVerification', {}).get('sha256', '')).strip().lower()
    duplicates, duplicate_error = find_image_duplicates(
        sha256=image_sha,
        exclude_id=record_id if saved else None,
        limit=8,
    )
    duplicate_info = {
        'sha256': image_sha,
        'isDuplicate': bool(duplicates),
        'count': len(duplicates),
        'items': duplicates,
        'error': duplicate_error,
    }
    result['duplicateImage'] = duplicate_info
    history_item['duplicateImage'] = duplicate_info

    return (
        jsonify(
            {
                **result,
                'historySaved': saved,
                'historySaveError': save_error,
                'historyItem': history_item,
            }
        ),
        200,
    )


@api_bp.post('/verify-image')
def verify_image():
    file = request.files.get('image')
    if file is None:
        return jsonify({'error': "'image' file is required."}), 400
    recency_mode = _normalize_recency_mode(str(request.form.get('recencyMode', 'all-time')))

    content_type = str(file.mimetype or '').lower()
    if content_type not in _ALLOWED_IMAGE_TYPES:
        return jsonify({'error': 'Unsupported image type. Use JPG, PNG, or WEBP.'}), 400

    image_bytes = file.read()
    if not image_bytes:
        return jsonify({'error': 'Uploaded image is empty.'}), 400
    if len(image_bytes) > _MAX_IMAGE_BYTES:
        return jsonify({'error': 'Image too large. Max size is 8 MB.'}), 400

    result = verify_image_news(
        image_bytes=image_bytes,
        filename=file.filename or 'uploaded-image',
        content_type=content_type or 'image/jpeg',
        recency_mode=recency_mode,
    )
    extracted_text = str(result.get('imageVerification', {}).get('ocrText', '')).strip()
    history_text = extracted_text or f"[Image Verification] {file.filename or 'uploaded-image'}"

    history_item = {
        'text': history_text,
        'result': result.get('label', 'Unverified'),
        'reason': result.get('reason', ''),
        'similarity': float(result.get('similarity', 0) or 0),
        'factCheckSimilarity': float(result.get('factCheckSimilarity', 0) or 0),
        'liveNewsSimilarity': float(result.get('liveNewsSimilarity', 0) or 0),
        'officialContextSimilarity': float(result.get('officialContextSimilarity', 0) or 0),
        'officialContextRelevance': float(result.get('officialContextRelevance', 0) or 0),
        'socialContextSimilarity': float(result.get('socialContextSimilarity', 0) or 0),
        'source': result.get('source', ''),
        'language': result.get('language', 'unknown'),
        'translationApplied': bool(result.get('translationApplied', False)),
        'translatedText': result.get('translatedText', history_text),
        'recencyMode': result.get('recencyMode', recency_mode),
        'evidence': result.get('evidence', {}),
        'imageVerification': result.get('imageVerification', {}),
        'createdAt': now_iso_utc(),
    }

    saved, save_error, record_id = save_history_record(history_item)
    if saved:
        history_item['id'] = record_id

    return (
        jsonify(
            {
                **result,
                'historySaved': saved,
                'historySaveError': save_error,
                'historyItem': history_item,
            }
        ),
        200,
    )


@api_bp.get('/history')
def get_history():
    raw_limit = request.args.get('limit', '50')
    try:
        limit = int(raw_limit)
    except ValueError:
        return jsonify({'error': "'limit' must be an integer."}), 400

    items, error = list_history(limit=limit)
    if error:
        return jsonify({'error': 'Failed to load history.', 'details': error, 'items': []}), 500

    return jsonify({'count': len(items), 'items': items}), 200


@api_bp.delete('/history')
def delete_history():
    deleted_count, error = clear_history()
    if error:
        return jsonify({'error': 'Failed to clear history.', 'details': error}), 500
    return jsonify({'deleted': deleted_count}), 200


@api_bp.delete('/history/<item_id>')
def delete_history_by_id(item_id: str):
    if not item_id.strip():
        return jsonify({'error': 'History item id is required.'}), 400

    deleted, error = delete_history_item(item_id)
    if not deleted:
        status = 404 if error == 'History item not found.' else 500
        return jsonify({'error': 'Failed to delete history item.', 'details': error}), status
    return jsonify({'deleted': 1, 'id': item_id}), 200
