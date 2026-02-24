"""Pydantic schemas for authentication."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator


class UserRegister(BaseModel):
    name: str
    username: str
    email: EmailStr
    password: str
    confirm_password: str
    captcha_token: Optional[str] = None

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, v, info):
        if "password" in info.data and v != info.data["password"]:
            raise ValueError("Passwords do not match")
        return v

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v):
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username may only contain letters, digits, hyphens, and underscores")
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        return v.lower()


class UserLogin(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    name: str
    username: str
    email: str
    is_verified: bool
    theme: str
    created_at: datetime

    model_config = {"from_attributes": True}


class VerifyEmail(BaseModel):
    email: EmailStr
    code: str


class ChangePassword(BaseModel):
    current_password: str
    new_password: str
    confirm_new_password: str

    @field_validator("confirm_new_password")
    @classmethod
    def new_passwords_match(cls, v, info):
        if "new_password" in info.data and v != info.data["new_password"]:
            raise ValueError("New passwords do not match")
        return v

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UpdateSettings(BaseModel):
    theme: Optional[str] = None
    name: Optional[str] = None
