from flask import Flask, render_template, request, jsonify
import os
from dotenv import load_dotenv
from vonage import Vonage, Auth
from vonage_video.models import SessionOptions, TokenOptions, MediaMode

load_dotenv()

application_id = os.getenv("VONAGE_APPLICATION_ID")
vonage_private_key = os.getenv("VONAGE_PRIVATE_KEY_PATH")

vonage_client = Vonage(
    Auth(
        application_id=application_id,
        private_key=vonage_private_key,
    )
)

session_options = SessionOptions(media_mode=MediaMode.ROUTED)
video_session = vonage_client.video.create_session(options=session_options)
session_id = video_session.session_id

app = Flask(__name__)


@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")


@app.route("/api/generate-session", methods=["POST"])
def generate_session():
    """API endpoint that generates and returns token and session data"""
    token_options = TokenOptions(session_id=session_id)
    token = vonage_client.video.generate_client_token(token_options).decode("utf-8")

    admin = "admin" in request.form
    name = request.form.get("name", "")

    return jsonify(
        {
            "session_id": session_id,
            "token": token,
            "is_admin": admin,
            "name": name,
            "application_id": application_id,
            "success": True,
        }
    )


if __name__ == "__main__":
    app.run(debug=True)
