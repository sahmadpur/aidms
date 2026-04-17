from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database
    database_url: str = "postgresql+asyncpg://aidms:changeme@localhost:5432/aidms"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin123"
    minio_bucket_name: str = "documents"
    minio_secure: bool = False

    # Google Cloud Vision
    google_cloud_credentials: str = ""
    google_cloud_project: str = ""

    # OpenAI
    openai_api_key: str = ""

    # Anthropic
    anthropic_api_key: str = ""

    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_expiry_minutes: int = 30
    jwt_refresh_expiry_days: int = 7

    # App
    cors_origins: list[str] = ["http://localhost:3000"]
    environment: str = "development"
    log_level: str = "INFO"
    max_upload_size_mb: int = 50


settings = Settings()
