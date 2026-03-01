from datetime import datetime, timezone, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import get_settings

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


async def get_current_customer(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = None,
) -> "Customer":  # type: ignore[name-defined]
    from app.models.customer import Customer

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Ungültige oder abgelaufene Session.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        customer_id: str | None = payload.get("sub")
        if customer_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    if db is None:
        # Fallback: return minimal dict when no DB session available
        return {"id": customer_id, "email": payload.get("email", "")}  # type: ignore

    from app.core.database import get_db
    result = await db.execute(
        select(Customer).where(Customer.id == customer_id, Customer.is_active == True)  # noqa: E712
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise credentials_exception
    return customer
