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

    # SMTP — required for email-OTP verification on /auth/register.
    # If smtp_host is empty (dev), the email service logs the code instead of sending.
    # smtp_secure=true with port 465 → implicit SSL (Yandex / Gmail SSL).
    # smtp_secure=false with port 587 → STARTTLS upgrade.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    smtp_from: str = "no-reply@docarchive.local"
    smtp_from_name: str = "DocArchive"
    smtp_secure: bool = False

    # OTP
    otp_ttl_minutes: int = 15
    otp_resend_cooldown_seconds: int = 60
    otp_max_attempts: int = 5

    # Frontend (linked from email body)
    frontend_base_url: str = "http://localhost:3000"

    # App
    cors_origins: list[str] = ["http://localhost:3000"]
    environment: str = "development"
    log_level: str = "INFO"
    max_upload_size_mb: int = 50


settings = Settings()
