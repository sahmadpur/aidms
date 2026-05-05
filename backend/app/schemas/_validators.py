"""Shared field validators used across multiple schema modules.

Keep these tiny — they're re-imported by `auth.py`, `admin.py`, and `user.py`.
"""


def validate_password_strength(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not any(c.isalpha() for c in v):
        raise ValueError("Password must contain at least one letter")
    if not any(c.isdigit() for c in v):
        raise ValueError("Password must contain at least one digit")
    return v


def validate_language(v: str) -> str:
    if v not in ("az", "ru", "en"):
        raise ValueError("Language must be one of: az, ru, en")
    return v


def validate_role(v: str) -> str:
    if v not in ("admin", "user"):
        raise ValueError("Role must be 'admin' or 'user'")
    return v
