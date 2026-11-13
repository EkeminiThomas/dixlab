"""Accounts: sign up, log in, who am I, update profile, log out."""
import secrets
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from ..db import get_db
from ..security import (bearer_token, create_session, current_user, delete_session,
                        hash_password, now_ms, verify_password)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SignUpIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class LogInIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


def _user(row) -> dict:
    return {"id": row["id"], "name": row["name"], "email": row["email"]}


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def sign_up(body: SignUpIn, db: sqlite3.Connection = Depends(get_db)):
    if db.execute("SELECT 1 FROM users WHERE email = ?", (body.email,)).fetchone():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with that email already exists. Try logging in.")
    user_id = f"u-{secrets.token_hex(8)}"
    db.execute(
        "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, body.name.strip(), body.email.lower(), hash_password(body.password), now_ms()),
    )
    token = create_session(db, user_id)
    return {"token": token, "user": {"id": user_id, "name": body.name.strip(), "email": body.email.lower()}}


@router.post("/login")
def log_in(body: LogInIn, db: sqlite3.Connection = Depends(get_db)):
    row = db.execute("SELECT * FROM users WHERE email = ?", (body.email,)).fetchone()
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That email and password don’t match.")
    return {"token": create_session(db, row["id"]), "user": _user(row)}


@router.get("/me")
def me(user=Depends(current_user)):
    return {"user": _user(user)}


@router.patch("/me")
def update_me(body: ProfileIn, user=Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    db.execute("UPDATE users SET name = ? WHERE id = ?", (body.name.strip(), user["id"]))
    return {"user": {"id": user["id"], "name": body.name.strip(), "email": user["email"]}}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def log_out(token: str | None = Depends(bearer_token), db: sqlite3.Connection = Depends(get_db)):
    if token:
        delete_session(db, token)
