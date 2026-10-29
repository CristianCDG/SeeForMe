from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import SecretStr
from functools import lru_cache
from pathlib import Path

class Settings(BaseSettings):
    meta_model_api_key: SecretStr
    app_api_key: SecretStr
    meta_base_url: str = "https://api.meta.ai/v1"
    meta_model: str = "muse-spark-1.3"
    meta_reasoning_effort: str = "low"
    meta_asr_model: str = "muse-voice-transcribe-1.0"
    cors_origins: list[str] = ["http://localhost:3000"]

    model_config = SettingsConfigDict(env_file=Path(__file__).parent / ".env", extra="ignore")


@lru_cache
def get_settings():
    return Settings()