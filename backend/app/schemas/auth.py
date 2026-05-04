from pydantic import BaseModel, EmailStr, field_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    language_preference: str = "en"

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isalpha() for c in v):
            raise ValueError("Password must contain at least one letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v

    @field_validator("language_preference")
    @classmethod
    def valid_language(cls, v: str) -> str:
        if v not in ("az", "ru", "en"):
            raise ValueError("Language must be one of: az, ru, en")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class RegisterResponse(BaseModel):
    email: EmailStr
    verification_required: bool = True
    expires_in_minutes: int


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str

    @field_validator("code")
    @classmethod
    def six_digits(cls, v: str) -> str:
        v = v.strip()
        if not (len(v) == 6 and v.isdigit()):
            raise ValueError("Code must be 6 digits")
        return v


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ResendVerificationResponse(BaseModel):
    ok: bool = True
    expires_in_minutes: int
