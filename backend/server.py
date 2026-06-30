import sys
import os

# Force UTF-8 output so unicode chars in verbose logs don't crash Windows charmap
os.environ['PYTHONIOENCODING'] = 'utf-8'
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# Suppress TF C++ logs and other verbose outputs
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

class DummyStream:
    def write(self, x): pass
    def flush(self): pass
    def close(self): pass

old_stderr = sys.stderr
sys.stderr = DummyStream()

try:
    import warnings
    warnings.filterwarnings("ignore")
    from flask import (
        Flask,
        request,
        jsonify,
        send_file
    )
    from flask_cors import CORS
    from analyze import (
        analyze_audio,
        _get_transcriber
    )
finally:
    sys.stderr = old_stderr

# Pre-load the ByteDance model at startup so the first request isn't slow
print("[server] Pre-loading ByteDance piano transcription model...")
_get_transcriber()
print("[server] Model ready. Starting Flask server.")

import os
import uuid
import json
import zipfile
import io
import pretty_midi

import numpy as np

# Maps MIME type (or its base without parameters) to the correct file extension.
# Used to determine the real extension when the uploaded filename has none or is wrong.
MIME_TO_EXT = {
    "audio/webm":   ".webm",
    "audio/ogg":    ".ogg",
    "audio/opus":   ".opus",
    "audio/mpeg":   ".mp3",
    "audio/mp3":    ".mp3",
    "audio/mp4":    ".m4a",
    "audio/m4a":    ".m4a",
    "audio/aac":    ".aac",
    "audio/flac":   ".flac",
    "audio/wav":    ".wav",
    "audio/wave":   ".wav",
    "audio/x-wav":  ".wav",
    "audio/x-m4a":  ".m4a",
}

def _resolve_extension(filename: str, content_type: str) -> str:
    """
    Return the correct file extension for an uploaded audio file.
    Priority:
      1. MIME type (most reliable — browsers always set this correctly)
      2. Filename extension (fallback)
      3. ".wav" (last resort)
    """
    # Strip parameters like "; codecs=opus" from the MIME type
    mime_base = (content_type or "").split(";")[0].strip().lower()
    mime_ext  = MIME_TO_EXT.get(mime_base, "")

    filename_ext = os.path.splitext(filename or "")[1].lower()

    ext = mime_ext or filename_ext or ".wav"
    print(f"[server] MIME='{mime_base}' → mime_ext='{mime_ext}', filename_ext='{filename_ext}' → using '{ext}'")
    return ext

# Ensure projects storage directory exists
PROJECTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "projects")
os.makedirs(PROJECTS_DIR, exist_ok=True)

def make_json_serializable(obj):
    if isinstance(obj, dict):
        return {k: make_json_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [make_json_serializable(x) for x in obj]
    elif isinstance(obj, tuple):
        return tuple(make_json_serializable(x) for x in obj)
    elif hasattr(obj, "item") and callable(obj.item):  # For numpy scalars (e.g. np.float32)
        return obj.item()
    elif isinstance(obj, (np.integer, np.floating)):
        return obj.item()
    elif isinstance(obj, np.ndarray):
        return make_json_serializable(obj.tolist())
    else:
        return obj

def create_midi_from_notes(raw_notes, tempo, output_path):
    pm = pretty_midi.PrettyMIDI(initial_tempo=tempo)
    piano_program = pretty_midi.instrument_name_to_program('Acoustic Grand Piano')
    piano = pretty_midi.Instrument(program=piano_program)
    
    for note_ev in raw_notes:
        # note_ev is [onset, offset, pitch, vel, instrument_ref]
        onset, offset, pitch, vel = note_ev[0], note_ev[1], int(note_ev[2]), float(note_ev[3])
        note = pretty_midi.Note(
            velocity=int(vel * 127),
            pitch=pitch,
            start=onset,
            end=offset
        )
        piano.notes.append(note)
        
    pm.instruments.append(piano)
    pm.write(output_path)

app = Flask(__name__)

CORS(app)


@app.route("/")
def home():

    return jsonify({
        "message":
        "Backend works"
    })


@app.route(
    "/analyze",
    methods=["POST"]
)
def analyze():
    import traceback

    # ── STAGE 0: Log raw request contents ─────────────────────
    print("\n" + "="*60)
    print("[STAGE 0] /analyze request received")
    print(f"  request.files : {dict(request.files)}")
    print(f"  request.form  : {dict(request.form)}")
    print("="*60)

    try:

        # ── STAGE 1: Receive upload ────────────────────────────
        print("[STAGE 1] Checking for 'audio' in request.files ...")
        try:
            if "audio" not in request.files:
                print("[STAGE 1] FAIL — 'audio' key missing from request.files")
                return jsonify({
                    "success": False,
                    "message": "No audio uploaded"
                }), 400

            file = request.files["audio"]
            print(f"[STAGE 1] OK — filename    : {repr(file.filename)}")
            print(f"[STAGE 1] OK — content_type: {repr(file.content_type)}")
            # Read size without consuming the stream permanently
            file_bytes = file.read()
            file_size  = len(file_bytes)
            print(f"[STAGE 1] OK — file size   : {file_size} bytes")
            if file_size == 0:
                print("[STAGE 1] FAIL — uploaded file is empty (0 bytes)")
                return jsonify({"success": False, "message": "Uploaded file is empty"}), 400
            file.seek(0)  # rewind so file.save() works
        except Exception:
            print("[STAGE 1] EXCEPTION while reading upload:")
            traceback.print_exc()
            raise

        # ── STAGE 2: Save uploaded file with real extension ────
        print("[STAGE 2] Saving uploaded file ...")
        try:
            extension   = _resolve_extension(file.filename, file.content_type)
            project_id  = str(uuid.uuid4())
            project_dir = os.path.join(PROJECTS_DIR, project_id)
            os.makedirs(project_dir, exist_ok=True)
            temp_file = os.path.join(project_dir, f"original{extension}")
            file.save(temp_file)
            saved_size_check = os.path.getsize(temp_file)
            print(f"[STAGE 2] OK — saved to {temp_file} ({saved_size_check} bytes on disk)")
        except Exception:
            print("[STAGE 2] EXCEPTION while saving file:")
            traceback.print_exc()
            raise

        # ── STAGE 3: Verify file exists and is readable ────────
        print("[STAGE 3] Verifying saved file ...")
        try:
            if not os.path.exists(temp_file):
                raise RuntimeError(f"Saved file not found on disk: {temp_file}")
            saved_size = os.path.getsize(temp_file)
            print(f"[STAGE 3] OK — file on disk: {saved_size} bytes")
            if saved_size == 0:
                raise RuntimeError(f"Saved file is 0 bytes: {temp_file}")
        except Exception:
            print("[STAGE 3] EXCEPTION while verifying file:")
            traceback.print_exc()
            raise

        # ── Read form parameters ───────────────────────────────
        monophonic       = request.form.get("monophonic", "false").lower() == "true"
        mode             = request.form.get("mode", "advanced")
        melody_priority  = request.form.get("melody_priority", "false").lower() == "true"
        use_spleeter     = request.form.get("use_spleeter", "auto")
        use_pitch_refinement = request.form.get("use_pitch_refinement", "auto")
        use_ensemble     = request.form.get("use_ensemble", "auto")
        speed_preset     = request.form.get("speed_preset", "accurate")
        print(f"[PARAMS] monophonic={monophonic}, mode={mode}, speed_preset={speed_preset}")

        # ── STAGE 4: ffmpeg / audio loading (inside preprocess) ─
        print("[STAGE 4] Running preprocess_audio (ffmpeg + librosa.load) ...")
        try:
            from preprocess import preprocess_audio
            from analyze import _get_transcriber
            from piano_transcription_inference import sample_rate as PT_SR
            audio, sr, complexity_info = preprocess_audio(
                temp_file,
                target_sr=PT_SR,
                use_spleeter=use_spleeter,
                speed_preset=speed_preset
            )
            print(f"[STAGE 4] OK — audio loaded: {len(audio)} samples @ {sr} Hz")
        except Exception:
            print("[STAGE 4] EXCEPTION in preprocess_audio:")
            traceback.print_exc()
            raise

        # ── STAGE 5: Transcription ─────────────────────────────
        print("[STAGE 5] Running full analyze_audio pipeline ...")
        try:
            result = analyze_audio(
                temp_file,
                monophonic=monophonic,
                mode=mode,
                melody_priority=melody_priority,
                use_spleeter=use_spleeter,
                use_pitch_refinement=use_pitch_refinement,
                use_ensemble=use_ensemble,
                speed_preset=speed_preset
            )
            print(f"[STAGE 5] OK — transcription complete. Notes: {len(result.get('notes', []))}")
        except Exception:
            print("[STAGE 5] EXCEPTION in analyze_audio:")
            traceback.print_exc()
            raise

        # ── Quality report ─────────────────────────────────────
        print("\n" + "="*50)
        print("        SERVER TRANSCRIPTION QUALITY REPORT")
        print("="*50)
        qs = result.get("quality_scores", {})
        print(f"Overall Quality:      {qs.get('overall_score', 0.0)}%")
        print(f"Chroma Similarity:    {qs.get('chroma_similarity', 0.0)}%")
        print(f"Pitch Accuracy:       {qs.get('pitch_accuracy', 0.0)}%")
        print(f"Rhythm Accuracy:      {qs.get('rhythm_accuracy', 0.0)}%")
        print(f"Tempo Consistency:    {qs.get('tempo_accuracy', 0.0)}%")
        print(f"Optimal Parameters:   BPM={qs.get('best_tempo')}, "
              f"Gap={qs.get('best_gap_threshold')}s, Grid={qs.get('best_grid_resolution')}")
        print("-"*50)
        print("        ACTIVATED PROCESSING MODULES")
        print("-"*50)
        modules = result.get("activated_modules", {})
        reasons = result.get("activation_reasons", {})
        for mod, active in modules.items():
            status = "ACTIVE" if active else "BYPASSED"
            reason_str = f" ({reasons.get(mod)})" if mod in reasons else ""
            print(f"{mod.replace('_', ' ').title():<25} : {status}{reason_str}")
        print("="*50 + "\n")

        # ── Clean up spectrogram file ──────────────────────────
        spec_file = f"{os.path.splitext(temp_file)[0]}_spectrogram.npy"
        if os.path.exists(spec_file):
            os.remove(spec_file)

        # ── Build and save project data ────────────────────────
        project_data = {
            "project_id": project_id,
            "original_filename": file.filename,
            "time_signature": result["time_signature"],
            "notes": result["notes"],
            "treble_notes": result.get("treble_notes", []),
            "bass_notes": result.get("bass_notes", []),
            "detected_tempo": result.get("detected_tempo", 120.0),
            "tempo": result.get("tempo", 120.0),
            "tempo_confidence": result.get("tempo_confidence", "HIGH"),
            "duration_preserved": result.get("duration_preserved", False),
            "musicxml": result.get("musicxml", ""),
            "quality_scores": result.get("quality_scores", {}),
            "raw_notes": result.get("raw_note_events", []),
            "best_grid_resolution": result.get("quality_scores", {}).get("best_grid_resolution", 0.25),
            "activated_modules": result.get("activated_modules", {}),
            "activation_reasons": result.get("activation_reasons", {}),
        }
        project_data = make_json_serializable(project_data)

        with open(os.path.join(project_dir, "data.json"), "w", encoding="utf-8") as f:
            json.dump(project_data, f, indent=2)

        response_payload = {
            "success": True,
            "project_id": project_id,
            "raw_note_events": result.get("raw_note_events", []),
            "notes": result["notes"],
            "treble_notes": result.get("treble_notes", []),
            "bass_notes": result.get("bass_notes", []),
            "time_signature": result["time_signature"],
            "detected_tempo": result.get("detected_tempo", 120.0),
            "tempo": result.get("tempo", 120.0),
            "tempo_confidence": result.get("tempo_confidence", "HIGH"),
            "duration_preserved": result.get("duration_preserved", False),
            "musicxml": result.get("musicxml", ""),
            "quality_scores": result.get("quality_scores", {}),
            "qualityScores": result.get("quality_scores", {}),
            "ab_metrics": result.get("ab_metrics", {}),
            "abMetrics": result.get("ab_metrics", {}),
            "activated_modules": result.get("activated_modules", {}),
            "activatedModules": result.get("activated_modules", {}),
            "activation_reasons": result.get("activation_reasons", {}),
            "activationReasons": result.get("activation_reasons", {}),
        }

        return jsonify(make_json_serializable(response_payload))

    except Exception as e:
        print("\n[/analyze] ── UNHANDLED EXCEPTION ──")
        traceback.print_exc()
        tb_str = traceback.format_exc()
        return jsonify({
            "success": False,
            "message": str(e) if str(e) else repr(e),
            "traceback": tb_str
        }), 500


@app.route("/export/midi/<project_id>", methods=["GET", "POST"])
def export_midi(project_id):
    try:
        raw_notes = None
        tempo = 120.0
        
        # Check if the request contains JSON body (POST request fallback)
        if request.is_json or (request.method == "POST" and request.data):
            data = request.json or {}
            raw_notes = data.get("raw_notes")
            tempo = float(data.get("tempo", 120.0))
            
        if raw_notes is None:
            project_dir = os.path.join(PROJECTS_DIR, project_id)
            if not os.path.exists(project_dir):
                return jsonify({"success": False, "message": "Project not found"}), 404
                
            with open(os.path.join(project_dir, "data.json"), "r", encoding="utf-8") as f:
                project_data = json.load(f)
                
            raw_notes = project_data.get("raw_notes", [])
            tempo = float(project_data.get("tempo", 120.0))
        
        if not raw_notes:
            return jsonify({"success": False, "message": "No note data found in project"}), 400
            
        temp_midi_path = os.path.join(PROJECTS_DIR, f"temp_{uuid.uuid4()}.mid")
        create_midi_from_notes(raw_notes, tempo, temp_midi_path)
        
        with open(temp_midi_path, "rb") as f:
            midi_data = f.read()
        if os.path.exists(temp_midi_path):
            os.remove(temp_midi_path)
            
        midi_buffer = io.BytesIO(midi_data)
        return send_file(
            midi_buffer,
            mimetype="audio/midi",
            as_attachment=True,
            download_name="score.mid"
        )
    except Exception as e:
        print("MIDI export error:", e)
        return jsonify({"success": False, "message": str(e)}), 500


@app.route("/export/wav/<project_id>", methods=["GET", "POST"])
def export_wav(project_id):
    try:
        raw_notes = None
        tempo = 120.0
        best_grid_res = 0.25
        
        # Check if the request contains JSON body (POST request fallback)
        if request.is_json or (request.method == "POST" and request.data):
            data = request.json or {}
            raw_notes = data.get("raw_notes")
            tempo = float(data.get("tempo", 120.0))
            best_grid_res = float(data.get("best_grid_resolution", 0.25))
            
        if raw_notes is None:
            project_dir = os.path.join(PROJECTS_DIR, project_id)
            if not os.path.exists(project_dir):
                return jsonify({"success": False, "message": "Project not found"}), 404
                
            with open(os.path.join(project_dir, "data.json"), "r", encoding="utf-8") as f:
                project_data = json.load(f)
                
            raw_notes = project_data.get("raw_notes", [])
            tempo = float(project_data.get("tempo", 120.0))
            best_grid_res = float(project_data.get("best_grid_resolution", 0.25))
        
        if not raw_notes:
            return jsonify({"success": False, "message": "No note data found in project"}), 400
            
        from evaluate import synthesize_from_notes
        import soundfile as sf
        
        audio_data = synthesize_from_notes(raw_notes, tempo, sr=22050, grid_resolution=best_grid_res)
        
        temp_wav_path = os.path.join(PROJECTS_DIR, f"temp_{uuid.uuid4()}.wav")
        sf.write(temp_wav_path, audio_data, 22050)
        
        with open(temp_wav_path, "rb") as f:
            wav_data = f.read()
        if os.path.exists(temp_wav_path):
            os.remove(temp_wav_path)
            
        wav_buffer = io.BytesIO(wav_data)
        return send_file(
            wav_buffer,
            mimetype="audio/wav",
            as_attachment=True,
            download_name="playback.wav"
        )
    except Exception as e:
        print("WAV export error:", e)
        return jsonify({"success": False, "message": str(e)}), 500


@app.route("/export/original/<project_id>", methods=["GET"])
def export_original(project_id):
    try:
        project_dir = os.path.join(PROJECTS_DIR, project_id)
        if not os.path.exists(project_dir):
            return jsonify({"success": False, "message": "Project not found"}), 404
            
        # Find original audio file
        original_audio_path = None
        for f_name in os.listdir(project_dir):
            if f_name.startswith("original."):
                original_audio_path = os.path.join(project_dir, f_name)
                break
                
        if not original_audio_path or not os.path.exists(original_audio_path):
            return jsonify({"success": False, "message": "Original audio not found"}), 404
            
        ext = os.path.splitext(original_audio_path)[1].lower()
        mimetype = "audio/wav"
        if ext == ".mp3":
            mimetype = "audio/mpeg"
        elif ext == ".m4a":
            mimetype = "audio/mp4"
            
        return send_file(original_audio_path, mimetype=mimetype)
    except Exception as e:
        print("Original export error:", e)
        return jsonify({"success": False, "message": str(e)}), 500




@app.route("/export/zip/<project_id>", methods=["POST"])
def export_zip(project_id):
    try:
        data = request.json or {}
        pdf_base64 = data.get("pdf_base64", "")
        
        musicxml_str = data.get("musicxml")
        raw_notes = data.get("raw_notes")
        tempo = data.get("tempo")
        best_grid_res = data.get("best_grid_resolution")
        
        project_dir = os.path.join(PROJECTS_DIR, project_id)
        original_audio_path = None
        
        # Load details from project directory if not provided in request body
        if musicxml_str is None or raw_notes is None or tempo is None:
            if os.path.exists(project_dir):
                with open(os.path.join(project_dir, "data.json"), "r", encoding="utf-8") as f:
                    project_data = json.load(f)
                
                if musicxml_str is None:
                    musicxml_str = project_data.get("musicxml", "")
                if tempo is None:
                    tempo = float(project_data.get("tempo", 120.0))
                if raw_notes is None:
                    raw_notes = project_data.get("raw_notes", [])
                if best_grid_res is None:
                    best_grid_res = float(project_data.get("best_grid_resolution", 0.25))
                    
                # Find original audio file path
                for f_name in os.listdir(project_dir):
                    if f_name.startswith("original."):
                        original_audio_path = os.path.join(project_dir, f_name)
                        break
            else:
                # Local fallback defaults if directory doesn't exist
                if musicxml_str is None:
                    musicxml_str = ""
                if tempo is None:
                    tempo = 120.0
                if raw_notes is None:
                    raw_notes = []
                if best_grid_res is None:
                    best_grid_res = 0.25
        
        # Create in-memory zip file
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            # 1. Add score.musicxml
            if musicxml_str:
                zip_file.writestr("score.musicxml", musicxml_str)
                
            # 2. Add score.pdf
            if pdf_base64:
                import base64
                if "," in pdf_base64:
                    pdf_base64 = pdf_base64.split(",")[1]
                pdf_data = base64.b64decode(pdf_base64)
                zip_file.writestr("score.pdf", pdf_data)
                
            # 3. Add score.mid
            if raw_notes:
                temp_midi_path = os.path.join(PROJECTS_DIR, f"temp_{uuid.uuid4()}.mid")
                create_midi_from_notes(raw_notes, float(tempo), temp_midi_path)
                with open(temp_midi_path, "rb") as f:
                    zip_file.writestr("score.mid", f.read())
                if os.path.exists(temp_midi_path):
                    os.remove(temp_midi_path)
                    
            # 4. Add original audio (only if directory and file exists)
            if original_audio_path and os.path.exists(original_audio_path):
                ext = os.path.splitext(original_audio_path)[1] or ".wav"
                with open(original_audio_path, "rb") as f:
                    zip_file.writestr(f"original_audio{ext}", f.read())
                    
            # 5. Add playback audio (playback.wav)
            if raw_notes:
                from evaluate import synthesize_from_notes
                import soundfile as sf
                
                audio_data = synthesize_from_notes(raw_notes, float(tempo), sr=22050, grid_resolution=float(best_grid_res))
                temp_wav_path = os.path.join(PROJECTS_DIR, f"temp_{uuid.uuid4()}.wav")
                sf.write(temp_wav_path, audio_data, 22050)
                
                with open(temp_wav_path, "rb") as f:
                    zip_file.writestr("playback.wav", f.read())
                if os.path.exists(temp_wav_path):
                    os.remove(temp_wav_path)
                    
        zip_buffer.seek(0)
        
        return send_file(
            zip_buffer,
            mimetype="application/zip",
            as_attachment=True,
            download_name="MeloNote_Project.zip"
        )
    except Exception as e:
        print("ZIP export error:", e)
        return jsonify({"success": False, "message": str(e)}), 500

from scanner.scanner_service import ScannerService, OMRRecognitionError
import threading

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
    
    print(f"[server] Initiate scan request: task_id={task_id}, file={image_file.filename} -> saving to {upload_path}")
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
                print(f"[server-task {task_id}] Stage updated: {stage}")
                
            xml_content, low_res = scanner_service.scan_sheet(upload_path, on_stage_change=update_stage)
            
            tasks[task_id]["status"] = "completed"
            tasks[task_id]["musicxml"] = xml_content
            if low_res:
                tasks[task_id]["warning"] = "Recognition accuracy may be reduced for low-resolution images."
            tasks[task_id]["stage"] = "completed"
            print(f"[server-task {task_id}] Finished successfully.")
            
        except OMRRecognitionError as e:
            tasks[task_id]["status"] = "failed"
            tasks[task_id]["error"] = str(e)
            tasks[task_id]["stage"] = "failed"
            print(f"[server-task {task_id}] OMRRecognitionError: {e}")
        except Exception as e:
            tasks[task_id]["status"] = "failed"
            tasks[task_id]["error"] = f"OMR sheet scan failed: {str(e)}"
            tasks[task_id]["stage"] = "failed"
            print(f"[server-task {task_id}] Unexpected exception: {e}")
            
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
        
    print(f"[server] GET /scan/status/{task_id} - status={task['status']}, stage={task['stage']}")
    
    return jsonify({
        "success": True,
        "status": task["status"],
        "stage": task["stage"],
        "error": task["error"],
        "musicxml": task["musicxml"],
        "warning": task.get("warning")
    })


if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False,
        use_reloader=False,
        threaded=True
    )