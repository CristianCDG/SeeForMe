from openai import OpenAI
from functools import lru_cache
from config import get_settings


@lru_cache
def get_meta_client():
    settings = get_settings()
    return OpenAI(base_url=settings.meta_base_url, api_key=settings.meta_model_api_key.get_secret_value(), timeout=30, max_retries=2)

