import os
import uuid
import threading
from flask import request, jsonify
from server import app
from scanner.scanner_service import ScannerService, OMRRecognitionError

# Initialize the OMR scanning orchestration service
scanner_service = ScannerService()
tasks = {}

@app.route("/scan/start", methods=["POST"])
def scan_sheet_start():
    """
    Accept multipart/form-data image uploads, save temporarily, spawn a background
    thread to process the image and run Audiveris OMR, and return a unique task ID.
    """
    if "image" not in request.files:
        return jsonify({
            "success": False,
            "error": "No sheet music image file provided. Please upload using key 'image'.",
            "message": "No sheet music image file provided. Please upload using key 'image'."
        }), 400
        
    image_file = request.files["image"]
    if image_file.filename == "":
        return jsonify({
            "success": False,
            "error": "Upload file name is empty.",
            "message": "Upload file name is empty."
        }), 400
        
    # Check file extension to filter invalid uploads
    _, ext = os.path.splitext(image_file.filename.lower())
    allowed_exts = {".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".gif", ".pdf"}
    if ext not in allowed_exts:
        return jsonify({
            "success": False,
            "error": f"Unsupported file type '{ext}'. Allowed: {', '.join(allowed_exts)}",
            "message": f"Unsupported file type '{ext}'. Allowed: {', '.join(allowed_exts)}"
        }), 400

    task_id = str(uuid.uuid4())
    temp_filename = f"{task_id}{ext}"
    upload_path = os.path.join(scanner_service.uploads_dir, temp_filename)
    
    print(f"[app] Initiate scan request: task_id={task_id}, file={image_file.filename} -> saving to {upload_path}")
    image_file.save(upload_path)
    
    # Initialize background task dictionary state
    tasks[task_id] = {
        "status": "processing",
        "stage": "preparing",
        "musicxml": None,
        "error": None
    }
    
    def background_scan_task():
        try:
            def update_stage(stage):
                tasks[task_id]["stage"] = stage
                print(f"[app-task {task_id}] Stage updated: {stage}")
                
            xml_content, low_res = scanner_service.scan_sheet(upload_path, on_stage_change=update_stage)
            
            tasks[task_id]["status"] = "completed"
            tasks[task_id]["musicxml"] = xml_content
            if low_res:
                tasks[task_id]["warning"] = "Recognition accuracy may be reduced for low-resolution images."
            tasks[task_id]["stage"] = "completed"
            print(f"[app-task {task_id}] Finished successfully.")
            
        except OMRRecognitionError as e:
            tasks[task_id]["status"] = "failed"
            tasks[task_id]["error"] = str(e)
            tasks[task_id]["stage"] = "failed"
            print(f"[app-task {task_id}] OMRRecognitionError: {e}")
        except Exception as e:
            tasks[task_id]["status"] = "failed"
            tasks[task_id]["error"] = f"OMR sheet scan failed: {str(e)}"
            tasks[task_id]["stage"] = "failed"
            print(f"[app-task {task_id}] Unexpected exception: {e}")
            
    # Spawn background thread
    t = threading.Thread(target=background_scan_task)
    t.daemon = True
    t.start()
    
    return jsonify({
        "success": True,
        "task_id": task_id
    })

@app.route("/scan/status/<task_id>", methods=["GET"])
def scan_sheet_status(task_id):
    """
    Query the status and stage of an OMR background process.
    """
    task = tasks.get(task_id)
    if not task:
        return jsonify({
            "success": False,
            "error": "Scan task not found.",
            "message": "Scan task not found."
        }), 404
        
    print(f"[app] GET /scan/status/{task_id} - status={task['status']}, stage={task['stage']}")
    
    return jsonify({
        "success": True,
        "status": task["status"],
        "stage": task["stage"],
        "error": task["error"],
        "musicxml": task["musicxml"],
        "warning": task.get("warning")
    })

if __name__ == "__main__":
    print("[app] Starting unified MeloNote Flask API (OMR Scan + Audio Transcribe)...")
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False,
        use_reloader=False,
        threaded=True
    )
