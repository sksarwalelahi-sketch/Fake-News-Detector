from dataclasses import dataclass
from pathlib import Path
import os

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')


@dataclass(frozen=True)
class Settings:
    host: str = os.getenv('FLASK_HOST', '0.0.0.0')
    port: int = int(os.getenv('PORT', '5000'))
    debug: bool = os.getenv('FLASK_DEBUG', 'true').lower() == 'true'

    fact_check_url: str = os.getenv(
        'GOOGLE_FACT_CHECK_API_URL',
        'https://factchecktools.googleapis.com/v1alpha1/claims:search',
    )
    live_news_rss_url: str = os.getenv(
        'LIVE_NEWS_RSS_URL',
        'https://news.google.com/rss/search',
    )
    translate_url: str = os.getenv(
        'GOOGLE_TRANSLATE_URL',
        'https://translate.googleapis.com/translate_a/single',
    )

    embedding_model_name: str = os.getenv('EMBEDDING_MODEL_NAME', 'paraphrase-multilingual-MiniLM-L12-v2')
    enable_embeddings: bool = os.getenv('ENABLE_EMBEDDINGS', 'false').lower() == 'true'
    fact_check_timeout_seconds: int = int(os.getenv('FACT_CHECK_TIMEOUT_SECONDS', '8'))
    live_news_timeout_seconds: int = int(os.getenv('LIVE_NEWS_TIMEOUT_SECONDS', '6'))
    translate_timeout_seconds: int = int(os.getenv('TRANSLATE_TIMEOUT_SECONDS', '8'))
    official_search_timeout_seconds: int = int(os.getenv('OFFICIAL_SEARCH_TIMEOUT_SECONDS', '4'))
    official_page_timeout_seconds: int = int(os.getenv('OFFICIAL_PAGE_TIMEOUT_SECONDS', '4'))
    max_official_context_items: int = int(os.getenv('MAX_OFFICIAL_CONTEXT_ITEMS', '5'))
    max_social_context_items: int = int(os.getenv('MAX_SOCIAL_CONTEXT_ITEMS', '5'))
    max_official_entities: int = int(os.getenv('MAX_OFFICIAL_ENTITIES', '4'))
    max_domains_per_entity: int = int(os.getenv('MAX_DOMAINS_PER_ENTITY', '2'))
    official_registry_path: str = os.getenv(
        'OFFICIAL_REGISTRY_PATH',
        str(BASE_DIR / 'data' / 'official_registry.json'),
    )
    official_cache_db_path: str = os.getenv(
        'OFFICIAL_CACHE_DB_PATH',
        str(BASE_DIR / 'data' / 'official_cache.db'),
    )
    official_cache_ttl_seconds: int = int(os.getenv('OFFICIAL_CACHE_TTL_SECONDS', '21600'))
    max_claims_to_evaluate: int = int(os.getenv('MAX_CLAIMS_TO_EVALUATE', '30'))
    top_claims_for_embedding: int = int(os.getenv('TOP_CLAIMS_FOR_EMBEDDING', '8'))
    max_live_news_articles: int = int(os.getenv('MAX_LIVE_NEWS_ARTICLES', '6'))

    firestore_collection: str = os.getenv('FIRESTORE_COLLECTION', 'analysis_history')
    firebase_service_account: str = os.getenv(
        'FIREBASE_SERVICE_ACCOUNT',
        str(BASE_DIR / 'serviceAccountKey.json'),
    )


settings = Settings()
