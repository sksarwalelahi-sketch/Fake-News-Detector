from io import BytesIO
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
import os
import hashlib
import re
from urllib.parse import unquote, urlparse

import requests
from backend_api.services.ai_engine import check_fake_news


def _try_ocr(image_bytes: bytes) -> Tuple[Optional[str], Optional[str]]:
    try:
        from PIL import Image
    except Exception:
        return None, 'Image dependency missing. Install Pillow to enable image verification.'

    try:
        import pytesseract
    except Exception:
        return None, 'OCR dependency missing. Install pytesseract to enable image text extraction.'

    tesseract_cmd = os.getenv('TESSERACT_CMD', '').strip()
    if tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

    try:
        image = Image.open(BytesIO(image_bytes)).convert('RGB')
    except Exception:
        return None, 'Unsupported image format. Please upload a valid JPG, PNG, or WEBP image.'

    try:
        text = pytesseract.image_to_string(image) or ''
    except Exception:
        return (
            None,
            'OCR engine is not available. Install Tesseract OCR and set TESSERACT_CMD in Backend/.env.',
        )

    cleaned = ' '.join(text.split()).strip()
    if not cleaned:
        return None, 'No readable text found in the uploaded image.'

    return cleaned, None


def _build_google_reverse_search_url(
    image_bytes: bytes,
    file_name: str,
    content_type: str,
) -> Tuple[Optional[str], Optional[str]]:
    files = {
        'encoded_image': (file_name, image_bytes, content_type or 'image/jpeg'),
    }
    data = {
        'image_content': '',
        'filename': file_name,
    }
    headers = {
        'User-Agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
            'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36'
        )
    }
    try:
        response = requests.post(
            'https://www.google.com/searchbyimage/upload',
            files=files,
            data=data,
            headers=headers,
            allow_redirects=False,
            timeout=20,
        )
        if response.status_code not in (301, 302):
            return None, f'Reverse image lookup returned status {response.status_code}.'

        location = response.headers.get('Location', '').strip()
        if not location:
            return None, 'Reverse image lookup did not return a search URL.'
        return location, None
    except Exception:
        return None, 'Could not reach reverse image lookup service.'


def _extract_candidate_urls(search_url: str) -> Tuple[list[str], Optional[str]]:
    headers = {
        'User-Agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
            'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36'
        )
    }
    try:
        response = requests.get(search_url, headers=headers, timeout=20)
        response.raise_for_status()
        html = response.text
    except Exception:
        return [], 'Could not fetch reverse-image result page.'

    matches = re.findall(r'href="/url\?q=([^"&]+)', html)
    clean_urls: list[str] = []
    for item in matches:
        decoded = unquote(item).strip()
        if not decoded.startswith('http'):
            continue
        domain = urlparse(decoded).netloc.lower()
        if 'google.' in domain:
            continue
        if decoded not in clean_urls:
            clean_urls.append(decoded)
        if len(clean_urls) >= 6:
            break

    return clean_urls, None


def verify_image_news(
    image_bytes: bytes,
    filename: str = 'uploaded-image',
    content_type: str = 'image/jpeg',
) -> Dict[str, Any]:
    extracted_text, ocr_error = _try_ocr(image_bytes)
    image_name = Path(filename).name or 'uploaded-image'
    image_sha256 = hashlib.sha256(image_bytes).hexdigest()
    reverse_search_url, reverse_lookup_error = _build_google_reverse_search_url(
        image_bytes=image_bytes,
        file_name=image_name,
        content_type=content_type,
    )
    candidate_urls: list[str] = []
    candidate_error: Optional[str] = None
    if reverse_search_url:
        candidate_urls, candidate_error = _extract_candidate_urls(reverse_search_url)

    if ocr_error:
        return {
            'label': 'Unverified',
            'reason': ocr_error,
            'similarity': 0.0,
            'liveNewsSimilarity': 0.0,
            'language': 'unknown',
            'translationApplied': False,
            'translatedText': '',
            'imageVerification': {
                'mode': 'image_ocr',
                'fileName': image_name,
                'sha256': image_sha256,
                'ocrText': '',
                'ocrSuccess': False,
                'ocrError': ocr_error,
                'reverseLookup': {
                    'provider': 'google',
                    'searchUrl': reverse_search_url or '',
                    'candidateUrls': candidate_urls,
                    'lookupError': reverse_lookup_error or candidate_error,
                },
            },
            'evidence': {
                'factCheck': None,
                'liveNews': [],
                'liveNewsConsensus': {
                    'status': 'Limited',
                    'score': 0.0,
                    'summary': 'No live-source analysis available because OCR text extraction failed.',
                },
                'liveNewsError': None,
            },
        }

    result = check_fake_news(extracted_text)
    result['imageVerification'] = {
        'mode': 'image_ocr',
        'fileName': image_name,
        'sha256': image_sha256,
        'ocrText': extracted_text,
        'ocrSuccess': True,
        'ocrError': None,
        'reverseLookup': {
            'provider': 'google',
            'searchUrl': reverse_search_url or '',
            'candidateUrls': candidate_urls,
            'lookupError': reverse_lookup_error or candidate_error,
        },
    }
    return result
