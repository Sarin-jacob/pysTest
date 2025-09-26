import os
from flask import Flask, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename

# --- Server Setup ---
app = Flask(__name__)

# --- Base URL Configuration ---
BASE_URL = os.getenv("APP_BASE_URL", "")

# --- File Upload Configuration ---
UPLOAD_FOLDER = os.getenv("APP_UPLOAD_FOLDER", "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER


# --- API Endpoint ---
@app.route(f"{BASE_URL}/api/upload", methods=["POST"])
def handle_upload():
    if "csvFile" not in request.files:
        return jsonify({"status": "error", "message": "No file part in the request"}), 400

    file = request.files["csvFile"]
    if file.filename == "":
        return jsonify({"status": "error", "message": "No file selected"}), 400

    filename = secure_filename(file.filename)
    save_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(save_path)

    print(f"Successfully received and saved file as '{filename}'")
    return jsonify({
        "status": "success",
        "message": "File uploaded and saved successfully",
        "filename_saved": filename
    })


# --- Static File Hosting ---
@app.route(f"{BASE_URL}/")
def serve_index():
    return send_from_directory("./public", "index.html")

@app.route(f"{BASE_URL}/<path:filename>")
def serve_static(filename):
    return send_from_directory("./public", filename)
