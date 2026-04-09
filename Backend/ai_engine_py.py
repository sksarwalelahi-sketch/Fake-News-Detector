# Backward-compatible wrapper. Prefer: backend_api.services.ai_engine
from backend_api.services.ai_engine import check_fake_news, fetch_fact_checks, find_best_match, get_api_key

__all__ = ['check_fake_news', 'fetch_fact_checks', 'find_best_match', 'get_api_key']
