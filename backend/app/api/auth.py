"""
Auth endpoints – Register & Login.
POST /api/auth/register → creates Customer in DB
POST /api/auth/token    → returns JWT access_token
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr

from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.models.customer import Customer

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterPayload(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None
    company: str | None = None
    gdpr_consent: bool = False


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterPayload, db: AsyncSession = Depends(get_db)):
    # Check email taken
    existing = await db.execute(select(Customer).where(Customer.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="E-Mail bereits registriert.")

    customer = Customer(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        company=payload.company,
        gdpr_consent=payload.gdpr_consent,
        is_active=True,
    )
    db.add(customer)
    await db.commit()
    await db.refresh(customer)

    token = create_access_token({"sub": str(customer.id), "email": customer.email})
    return {"access_token": token, "token_type": "bearer", "customer_id": str(customer.id)}


@router.post("/token", response_model=TokenResponse)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Customer).where(Customer.email == form.username))
    customer = result.scalar_one_or_none()
    if not customer or not verify_password(form.password, customer.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-Mail oder Passwort falsch.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not customer.is_active:
        raise HTTPException(status_code=403, detail="Account deaktiviert.")

    token = create_access_token({"sub": str(customer.id), "email": customer.email})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me")
async def me(db: AsyncSession = Depends(get_db), token: str = Depends(
    __import__("fastapi.security", fromlist=["OAuth2PasswordBearer"]).OAuth2PasswordBearer(tokenUrl="/api/auth/token")
)):
    from app.core.security import get_current_customer
    customer = await get_current_customer(token, db)
    return {"id": str(customer.id), "email": customer.email, "full_name": customer.full_name}
