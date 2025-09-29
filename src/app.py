import os
from flask import Flask, request, jsonify, send_from_directory, abort
from werkzeug.utils import secure_filename
from flask_cors import CORS

# --- Configuration ---
BASE_URL = os.getenv("APP_BASE_URL", "")
UPLOAD_FOLDER = os.getenv("APP_UPLOAD_FOLDER", "uploads")
MAX_FILE_SIZE_MB = os.getenv("APP_MAX_FILE_SIZE_MB", 8)  # Default to 8 MB
try:
    MAX_FILE_SIZE_MB = int(MAX_FILE_SIZE_MB)
except ValueError:
    MAX_FILE_SIZE_MB = 8
ALLOWED_EXTENSIONS = {'csv'}
# CORS_ORIGINS is now handled dynamically below

# --- Application Setup ---
app = Flask(__name__)

# --- Security & App Configuration ---
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE_MB * 1024 * 1024
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# --- Dynamic CORS Configuration ---
APP_DOMAIN = os.getenv("APP_DOMAIN")
if APP_DOMAIN:
    # Sanitize the domain variable: remove protocol and any trailing slashes.
    # This robustly handles inputs like "https://example.com/" and makes it "example.com"
    sanitized_domain = APP_DOMAIN.replace("https://", "").replace("http://", "").rstrip('/')

    # A CORS origin is in the format `scheme://domain`. The BASE_URL (path) is not part of it.
    allowed_origins = [
        f"https://{sanitized_domain}",
        f"http://{sanitized_domain}"
    ]
    CORS(app, resources={r"/api/*": {"origins": allowed_origins}})
    print(f"CORS protection enabled for origins: {allowed_origins}")
else:
    # If APP_DOMAIN is not set, CORS will not be configured.
    # This is a secure default, as it makes the browser enforce its Same-Origin Policy.
    # For local development, you must set APP_DOMAIN (e.g., APP_DOMAIN=localhost:5000)
    print("WARNING: APP_DOMAIN environment variable not set. Cross-origin requests will be blocked by default.")


# --- Helper Function for Server-Side Validation ---
def is_allowed_file(file):
    """
    Performs the definitive security check on the uploaded file.
    This check is mandatory and cannot be bypassed.
    """
    if not file or not file.filename:
        return False

    has_allowed_extension = '.' in file.filename and \
        file.filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

    is_correct_mimetype = file.mimetype == 'text/csv'

    return has_allowed_extension and is_correct_mimetype

# --- API Endpoint: Secured File Upload ---
@app.route(f"{BASE_URL}/api/upload", methods=["POST"])
def handle_upload():
    if "csvFile" not in request.files:
        return jsonify({"status": "error", "message": "No file part in the request"}), 400

    file = request.files["csvFile"]

    # The server performs its own, non-negotiable validation
    if not is_allowed_file(file):
        return jsonify({"status": "error", "message": "Invalid file. The server rejected the file type."}), 400

    filename = secure_filename(file.filename)
    save_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)

    if os.path.exists(save_path):
        return jsonify({
            "status": "error",
            "message": f"File '{filename}' already exists on the server."
        }), 409 # HTTP 409 Conflict

    try:
        file.save(save_path)
    except Exception as e:
        app.logger.error(f"Failed to save file: {e}")
        return jsonify({"status": "error", "message": "Could not save file to server."}), 500

    print(f"Successfully received and saved file as '{filename}'")

    return jsonify({
        "status": "success",
        "message": f"File '{filename}' uploaded successfully.",
    }), 201

# --- Static File Hosting ---
@app.route(f"{BASE_URL}/")
def serve_index():
    return send_from_directory("./public", "index.html")

@app.route(f"{BASE_URL}/<path:filename>")
def serve_static(filename):
    safe_filename = secure_filename(filename)
    if safe_filename != filename:
        return abort(404)
    return send_from_directory("./public", filename)