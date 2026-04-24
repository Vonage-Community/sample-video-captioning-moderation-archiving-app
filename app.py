from flask import Flask, render_template, request
import os
from dotenv import load_dotenv
from vonage import Vonage, Auth
from vonage_video.models import SessionOptions, TokenOptions, MediaMode

load_dotenv()

application_id = os.getenv("VONAGE_APPLICATION_ID")
vonage_private_key = os.getenv("VONAGE_PRIVATE_KEY")

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


@app.route("/", methods=["GET", "POST"])
def index():
    index_text = (
        "Please log in: As an <a href='admin'>Admin</a> "
        "or as a <a href='join'>Participant</a>"
    )
    if request.method == "POST":
        token_options = TokenOptions(session_id=session_id)
        token = vonage_client.video.generate_client_token(token_options).decode("utf-8")

        admin = "admin" in request.form
        name = request.form["name"]

        return render_template(
            "index.html",
            session_id=session_id,
            token=token,
            is_admin=admin,
            name=name,
            application_id=application_id,
        )

    return index_text


@app.route("/admin")
def admin():
    return render_template("admin.html")


@app.route("/join")
def join():
    return render_template("join.html")


if __name__ == "__main__":
    app.run(debug=True)
