"""Authentication service: JWT, password hashing, email verification."""
import logging
import random
import smtplib
import string
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import bcrypt
from jose import JWTError, jwt

from config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta if expires_delta else timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_token(token: str) -> Optional[str]:
    """Decode a JWT and return the subject (user_id), or None on failure."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: Optional[str] = payload.get("sub")
        return user_id
    except JWTError:
        return None


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Return a bcrypt hash of the plain-text password."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against its bcrypt hash."""
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


# ---------------------------------------------------------------------------
# Email verification
# ---------------------------------------------------------------------------

def generate_verification_code() -> str:
    """Generate a random 6-digit verification code."""
    return "".join(random.choices(string.digits, k=6))


def send_verification_email(email: str, code: str) -> None:
    """
    Send a verification email containing *code* to *email*.

    If SMTP credentials are not configured the code is printed to the console
    so development works without an email server.
    """
    if not settings.SMTP_HOST or not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.info("=== EMAIL VERIFICATION (dev mode) ===")
        logger.info("To: %s | Code: %s", email, code)
        print(f"\n[DEV] Verification code for {email}: {code}\n")
        return

    html_body = f"""
    <html>
      <body>
        <h2>Welcome to ML Studio!</h2>
        <p>Your email verification code is:</p>
        <h1 style="letter-spacing:6px; color:#6366f1;">{code}</h1>
        <p>This code expires in 30 minutes.</p>
        <p>If you did not request this, you can ignore this email.</p>
      </body>
    </html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "ML Studio — Verify your email"
    msg["From"] = settings.SMTP_USER
    msg["To"] = email
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_USER, email, msg.as_string())
        logger.info("Verification email sent to %s", email)
    except Exception as exc:
        logger.error("Failed to send verification email to %s: %s", email, exc)
        # Fall back to console so the user can still verify in dev
        print(f"\n[FALLBACK] Verification code for {email}: {code}\n")
