from flask import Flask, render_template, request, jsonify, session
import os
from dotenv import load_dotenv
from vonage import Vonage, Auth
from vonage_video.models import (
    SessionOptions,
    TokenOptions,
    MediaMode,
    CreateArchiveRequest,
    Archive,
    CaptionsData,
    CaptionsOptions,
    TokenRole,
)

# Retrieve environment variables
load_dotenv()
application_id = os.getenv("VONAGE_APPLICATION_ID")
vonage_private_key = os.getenv("VONAGE_PRIVATE_KEY_PATH")

# Instantiate a Vonage client
vonage_client = Vonage(
    Auth(
        application_id=application_id,
        private_key=vonage_private_key,
    )
)

# Instantiate a video session
session_options = SessionOptions(media_mode=MediaMode.ROUTED)
video_session = vonage_client.video.create_session(options=session_options)
session_id = video_session.session_id

# Create a Flask instance
app = Flask(__name__)
app.secret_key = "development-secret-key"

@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")

@app.route("/api/generate-session", methods=["POST"])
def generate_session():
    """API endpoint that generates and returns token and session data
    Assigns roles to tokens based on whether the user joins the session as an presenter or not
    """
    print(f"REQUEST FORM DATA: ==> {request.form}")
    name = request.form.get("name", "")
    presenter = "presenter" in request.form

    if presenter:
        token_options = TokenOptions(session_id=session_id, role=TokenRole.MODERATOR)
    else:
        token_options = TokenOptions(session_id=session_id, role=TokenRole.PUBLISHER)
    token = vonage_client.video.generate_client_token(token_options).decode("utf-8")

    # Add to the Flask session
    session["is_presenter"] = presenter
    session["token"] = token

    return jsonify(
        {
            "session_id": session_id,
            "token": token,
            "is_presenter": presenter,
            "name": name,
            "application_id": application_id,
            "success": True,
        }
    )


# ===============================
# Endpoints for closed captioning
# ===============================
@app.route("/captions/start", methods=["POST"])
def start_captions():
    """Endpoint to start captions"""
    data = request.get_json()
    print(f"Start captions request data: ==> {data}")
    session_id = data.get("sessionId")
    token_id = data.get("token")

    if not session.get("is_presenter"):
        return jsonify({"error": "Unauthorized"}), 403

    if not session_id or not token_id:
        return jsonify({"error": "sessionId or token is missing"}), 400

    options = CaptionsOptions(
        session_id=session_id,
        token=token_id,
    )

    captions: CaptionsData = vonage_client.video.start_captions(options)

    return jsonify({"caption_id": captions.captions_id})


@app.route("/captions/<captions_id>/stop", methods=["POST"])
def stop_captions(captions_id):
    """Endpoint to stop captions"""

    if not captions_id:
        return jsonify({"error": "no captions id"}), 400

    try:
        vonage_client.video.stop_captions(CaptionsData(captions_id=captions_id))
        return jsonify({"success": True}), 202
    except Exception as e:
        print(f"Error stopping captions: {e}")
        return jsonify({"error": str(e)}), 500


# =======================
# Endpoints for muting
# =======================
@app.route("/mute-stream", methods=["POST"])
def mute_stream():
    data = request.json
    print(f"REQUEST DATA: ==> {data}")
    session_id = data.get("sessionId")
    stream_id = data.get("streamId")

    print(f"session id: ==> {session_id}")
    print(f"stream id: ==> {stream_id}")

    vonage_client.video.mute_stream(session_id, stream_id)
    return jsonify({"message": f"Stream {stream_id} muted successfully."}), 200


# =======================
# Endpoints for removal
# =======================
@app.route("/remove-participant", methods=["POST"])
def remove_participant():
    data = request.json
    print(f"REQUEST DATA: ==> {data}")
    session_id = data.get("sessionId")
    connection_id = data.get("connection_id")

    print(f"session id: ==> {session_id}")
    print(f"connection id: ==> {connection_id}")

    vonage_client.video.disconnect_client(session_id, connection_id)
    return (
        jsonify({"message": f"Participant {connection_id} removed successfully."}),
        200,
    )


# =======================
# Endpoints for archiving
# =======================
@app.route("/archive/start", methods=["POST"])
def start_archive():
    """Endpoint to start archiving"""
    data = request.get_json()
    session_id = data.get("sessionId")

    print(f"flask session: ==> {session}")

    if not session_id:
        return jsonify({"error": "sessionId is required"}), 400
    if not session.get("is_presenter"):
        return jsonify({"error": "Unauthorized"}), 403

    archive_options = CreateArchiveRequest(session_id=session_id)
    archive: Archive = vonage_client.video.start_archive(archive_options)

    archive_id = archive.id

    return jsonify({"archive_id": archive_id, "status": archive.status})


@app.route("/archive/<archive_id>/stop", methods=["POST"])
def stop_archive(archive_id):
    """Endpoint to stop archiving"""

    if not archive_id:
        return jsonify({"error": "archiveId is required"}), 400

    archive: Archive = vonage_client.video.stop_archive(archive_id)
    return jsonify({"archive_id": archive.id, "status": archive.status})


@app.get("/archive/<archive_id>/status")
def archive_status(archive_id):
    """Endpoint to check status of archive"""
    try:
        archive = vonage_client.video.get_archive(archive_id)
        return jsonify(
            {
                "status": archive.status,
                "url": archive.url,
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)
