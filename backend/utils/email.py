from fastapi_mail import FastMail, MessageSchema, ConnectionConfig
from pydantic import EmailStr
import os
from dotenv import load_dotenv

load_dotenv()

conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME", ""),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD", ""),
    MAIL_FROM=os.getenv("MAIL_FROM", "admin@mastergpt.com"),
    MAIL_PORT=int(os.getenv("MAIL_PORT", 587)),
    MAIL_SERVER=os.getenv("MAIL_SERVER", "smtp.gmail.com"),
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True
)

async def send_password_reset_email(email: EmailStr, token: str):
    # In a real app, this would be a link to your frontend reset page
    reset_link = f"http://localhost:8000/reset-password?token={token}"
    
    message = MessageSchema(
        subject="MasterGPT - Password Reset",
        recipients=[email],
        body=f"Clique no link para resetar sua senha: {reset_link}",
        subtype="html"
    )

    fm = FastMail(conf)
    # Only try to send if credentials are provided
    if os.getenv("MAIL_USERNAME"):
        await fm.send_message(message)
    else:
        print(f"DEBUG: Password reset token for {email}: {token}")
