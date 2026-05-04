import hmac
import secrets
from hashlib import sha256

from app.core.config import settings


def generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_code(code: str) -> str:
    return hmac.new(
        settings.jwt_secret.encode("utf-8"),
        code.encode("utf-8"),
        sha256,
    ).hexdigest()


def verify_code(code: str, expected_hash: str) -> bool:
    return hmac.compare_digest(hash_code(code), expected_hash)
