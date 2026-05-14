import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    DATABASE_PATH = "./video_sessions.db"
    
    # Vonage Credentials
    VONAGE_APPLICATION_ID = os.getenv("VONAGE_APPLICATION_ID")
    VONAGE_PRIVATE_KEY_PATH = os.getenv("VONAGE_PRIVATE_KEY_PATH")
