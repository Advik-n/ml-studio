"""Authentication router."""
import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models.user import User
from schemas.auth import (
    ChangePassword,
    Token,
    UpdateSettings,
    UserLogin,
    UserRegister,
    UserResponse,
    VerifyEmail,
)
from services.auth_service import create_access_token, hash_password, verify_password
from utils.dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    """Register a new user account (email verification disabled)."""
    # Enforce maximum user cap
    if db.query(User).count() >= settings.MAX_USERS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Maximum number of users reached. Registration is closed.",
        )

    # Uniqueness checks
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered.")
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken.")

    user = User(
        name=payload.name,
        username=payload.username,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        is_verified=True,
        verification_code=None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    logger.info("New user registered (auto-verified): %s (%s)", user.username, user.email)
    return user


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    """Authenticate a user and return a JWT access token."""
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
        )
    token = create_access_token(
        data={"sub": user.id},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": token, "token_type": "bearer"}


@router.post("/verify-email")
def verify_email(_: VerifyEmail, __: Session = Depends(get_db)):
    """Email verification disabled."""
    raise HTTPException(status_code=status.HTTP_410_GONE, detail="Email verification is disabled.")


@router.post("/resend-verification")
def resend_verification(email: str, db: Session = Depends(get_db)):
    """Email verification disabled."""
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    raise HTTPException(status_code=status.HTTP_410_GONE, detail="Email verification is disabled.")


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return current_user


@router.put("/settings", response_model=UserResponse)
def update_settings(
    payload: UpdateSettings,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the current user's theme and/or display name."""
    if payload.theme is not None:
        current_user.theme = payload.theme
    if payload.name is not None:
        current_user.name = payload.name
    db.commit()
    db.refresh(current_user)
    return current_user


@router.put("/change-password")
def change_password(
    payload: ChangePassword,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the current user's password."""
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect.")

    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password changed successfully."}
