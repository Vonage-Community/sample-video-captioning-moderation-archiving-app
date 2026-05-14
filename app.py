from flask import Flask, render_template, request, jsonify, redirect
import os
from dotenv import load_dotenv
from vonage import Vonage, Auth
from vonage_video.models import SessionOptions, TokenOptions, MediaMode, CreateArchiveRequest, Archive
from database import db

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

# Store active sessions in memory (session_id -> session info)
active_sessions = {}

@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")


@app.route("/api/generate-session", methods=["POST"])
def generate_session():
    """API endpoint that generates and returns token and session data"""
    token_options = TokenOptions(session_id=session_id)
    token = vonage_client.video.generate_client_token(token_options).decode("utf-8")
    # db_session_id = db.create_session(session_id)

    # Store in memory
    # active_sessions[session_id] = {
    #     'db_id': db_session_id,
    # }

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

@app.route("/archive/start", methods=["POST"])
def start_archive():
    data = request.get_json()
    session_id = data.get("sessionId")

    if not session_id:
        return jsonify({"error": "sessionId is required"}), 400

    # Start the archive (at least one client must be connected to the session)
    archive_options = CreateArchiveRequest(session_id=session_id)
    archive: Archive = vonage_client.video.start_archive(archive_options)

    archive_id = archive.id

    # db.update_session_recording(session_id=session_id, archive_id=archive_id)

    # Store archive.id in your database for later use
    return jsonify({"archive_id": archive_id, "status": archive.status})

@app.route("/archive/<archive_id>/stop", methods=["POST"])
def stop_archive(archive_id):
    # data = request.get_json()
    # archive_id = data.get("archiveId")

    if not archive_id:
        return jsonify({"error": "archiveId is required"}), 400

    archive: Archive = vonage_client.video.stop_archive(archive_id)
    return jsonify({"archive_id": archive.id, "status": archive.status})

# Optional: Retrieve archive info (e.g., to get the download URL)
@app.route("/archive/<archive_id>", methods=["GET"])
def get_archive(archive_id):
    try:
        archive = vonage_client.video.get_archive(archive_id)
        if archive.status == 'available':
            return redirect(archive.url)
        else:
            return jsonify({"message": "Archive not yet available", "status": archive.status}), 202
    except Exception as error:
        return jsonify({"error": str(error)}), 500


if __name__ == "__main__":
    app.run(debug=True)
