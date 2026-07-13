import os
import shutil
import uuid
import xml.etree.ElementTree as ET
from scanner.preprocess import preprocess_sheet_music, preprocess_sheet_music_candidates, OMRRecognitionError
from scanner.audiveris import AudiverisWrapper
from scanner.parser import MusicXMLParser

class ScannerService:
    def __init__(self, base_dir=None, audiveris_path=None):
        # Resolve backend path dynamically
        self.base_dir = base_dir or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.uploads_dir = os.path.join(self.base_dir, "uploads")
        self.temp_dir = os.path.join(self.base_dir, "temp")
        self.outputs_dir = os.path.join(self.base_dir, "outputs")
        
        # Ensure directories exist
        os.makedirs(self.uploads_dir, exist_ok=True)
        os.makedirs(self.temp_dir, exist_ok=True)
        os.makedirs(self.outputs_dir, exist_ok=True)
        
        self.audiveris_wrapper = AudiverisWrapper(executable_path=audiveris_path)

    def scan_sheet(self, input_file_path, on_stage_change=None):
        """
        Orchestrate OMR scanning workflow:
          1. Preprocess the image generating multiple binarization candidates.
          2. Sequentially run Audiveris OMR on each candidate.
          3. If all fail, execute Phase 5 recovery on the OMR files.
          4. Parse and validate the output MusicXML.
          5. Clean up candidate and temporary files.
        """
        def notify(stage):
            if on_stage_change:
                on_stage_change(stage)

        if not os.path.exists(input_file_path):
            raise FileNotFoundError(f"Uploaded file not found: {input_file_path}")
            
        job_id = str(uuid.uuid4())
        original_name = os.path.basename(input_file_path)
        base_name, ext = os.path.splitext(original_name)
        
        cropped_filename = f"{base_name}_cropped_{job_id}{ext}"
        cropped_path = os.path.join(self.temp_dir, cropped_filename)
        
        preprocessed_filename = f"{base_name}_clean_{job_id}{ext}"
        preprocessed_path = os.path.join(self.temp_dir, preprocessed_filename)
        
        stage = "uploading"
        dimensions = (0, 0)
        quality_warning = False
        success = False
        candidates = []
        
        try:
            print(f"[scanner_service] === BEGIN OMR SCAN PIPELINE ===")
            print(f"[scanner_service] Uploaded image path: {input_file_path}")
            
            # Step 1: Preprocess image candidates using OpenCV
            stage = "preparing"
            notify("preparing")
            print(f"[scanner_service] Generating binarized candidates...")
            
            candidates, quality_warning, low_res_warning = preprocess_sheet_music_candidates(
                input_file_path,
                preprocessed_path,
                cropped_path=cropped_path,
                on_stage_change=on_stage_change
            )
            
            # Retrieve cropped image dimensions for logs
            if os.path.exists(cropped_path):
                try:
                    import cv2
                    cropped_img = cv2.imread(cropped_path, cv2.IMREAD_GRAYSCALE)
                    if cropped_img is not None:
                        dimensions = (cropped_img.shape[1], cropped_img.shape[0])
                except Exception as dim_err:
                    print(f"[scanner_service] Failed to read cropped dimensions: {dim_err}")
            
            # Step 2: Run OMR (Audiveris) on candidates sequentially until success
            stage = "recognizing_symbols"
            notify("recognizing_symbols")
            
            mxl_output_path = None
            successful_candidate = None
            last_failed_omr = None
            last_failed_preprocessed = None
            
            for i, cand in enumerate(candidates):
                cand_name = cand["name"]
                cand_path = cand["path"]
                print(f"[scanner_service] --- Attempt {i+1}/{len(candidates)}: {cand_name} (Score: {cand['score']:.1f}) ---")
                
                try:
                    mxl_output_path = self.audiveris_wrapper.run_omr(cand_path, self.outputs_dir)
                    successful_candidate = cand
                    print(f"[scanner_service] Success on candidate: {cand_name}")
                    break
                except Exception as cand_err:
                    print(f"[scanner_service] Candidate {cand_name} failed: {cand_err}")
                    cand_base = os.path.splitext(os.path.basename(cand_path))[0]
                    possible_omr = os.path.join(self.outputs_dir, f"{cand_base}.omr")
                    if os.path.exists(possible_omr):
                        last_failed_omr = possible_omr
                        last_failed_preprocessed = cand_path
            
            # Step 2.5: Phase 5 Recovery if all candidates failed to generate MXL directly
            if not mxl_output_path:
                print("[scanner_service] All preprocessing attempts failed. Triggering Phase 5 OMR recovery...")
                if last_failed_omr and os.path.exists(last_failed_omr):
                    recovery_log = os.path.join(self.outputs_dir, f"{os.path.splitext(os.path.basename(last_failed_preprocessed))[0]}_recovery.log")
                    recovered = self.audiveris_wrapper.run_export_recovery(
                        last_failed_omr, self.outputs_dir, recovery_log
                    )
                    if recovered:
                        try:
                            mxl_output_path = self.audiveris_wrapper._locate_mxl_file(
                                last_failed_preprocessed, self.outputs_dir
                            )
                            print(f"[scanner_service] Recovery successful. Generated MusicXML: {mxl_output_path}")
                        except Exception as loc_err:
                            print(f"[scanner_service] Failed to locate recovered MXL: {loc_err}")
            
            if not mxl_output_path:
                raise OMRRecognitionError("Music notes detected but MusicXML generation failed after all attempts.")
                
            # Step 3: Parse and validate the resulting MusicXML/MXL file
            stage = "generating_xml"
            notify("generating_xml")
            print(f"[scanner_service] Parsing and validating generated MXL: {mxl_output_path}")
            musicxml_content = MusicXMLParser.process_and_validate(mxl_output_path)
            
            num_staves = 0
            num_systems = 0
            num_measures = 0
            note_count = 0
            has_notes = False
            
            try:
                root = ET.fromstring(musicxml_content)
                note_tags = root.findall(".//note")
                note_count = len(note_tags)
                has_notes = note_count > 0
                num_measures = len(root.findall(".//measure"))
                
                staves_elem = root.find(".//staves")
                if staves_elem is not None:
                    num_staves = int(staves_elem.text)
                else:
                    staff_ids = {n.find("staff").text for n in note_tags if n.find("staff") is not None}
                    num_staves = len(staff_ids) if staff_ids else 1
                    
                print_tags = root.findall(".//print")
                new_systems = [p for p in print_tags if p.attrib.get("new-system") == "yes"]
                num_systems = len(new_systems) + 1
            except Exception as e:
                print(f"[scanner_service] Failed to parse OMR metadata: {e}")
                
            print(f"\n[DEVELOPMENT LOG] OMR Execution Success:")
            print(f"  - Image Dimensions: {dimensions[0]}x{dimensions[1]}")
            print(f"  - Number of Detected Staves: {num_staves}")
            print(f"  - Number of Detected Systems: {num_systems}")
            print(f"  - Notes Recognized: {has_notes} (Count: {note_count})\n")
                
            warnings_list = []
            if low_res_warning:
                warnings_list.append("Recognition accuracy may be reduced for low-resolution images.")
            if has_notes and (num_staves == 0 or num_systems == 0 or num_measures == 0):
                warnings_list.append("Some measures or notes may be incomplete.")
                
            warning_msg = " ".join(warnings_list) if warnings_list else None
            
            print(f"[scanner_service] === END OMR SCAN PIPELINE SUCCESS ===")
            success = True
            return musicxml_content, warning_msg
            
        except Exception as e:
            print(f"[scanner_service] === END OMR SCAN PIPELINE FAILURE: {str(e)} ===")
            
            # Locate last failed OMR file for failure diagnostics
            omr_path = last_failed_omr
            diagnostics = None
            if omr_path and os.path.exists(omr_path):
                print(f"[scanner_service] Found OMR file at: {omr_path}. Running structural diagnostics...")
                diagnostics = self._analyze_omr_project(omr_path)
            
            if not diagnostics or diagnostics.get("stage_failed") == "unknown":
                log_error = self._analyze_console_log(preprocessed_filename)
                if log_error:
                    if not diagnostics:
                        diagnostics = {}
                    diagnostics["detailed_error"] = log_error
            
            # Preserve debug files
            self._preserve_debug_files(
                job_id=job_id,
                input_file_path=input_file_path,
                preprocessed_path=preprocessed_path,
                preprocessed_filename=preprocessed_filename,
                omr_path=omr_path
            )
            
            classified_error = self.classify_omr_error(e, stage, dimensions, quality_warning, diagnostics)
            raise classified_error
            
        finally:
            if success:
                print("[scanner_service] Success. Cleaning up temporary job files...")
                for cand in candidates:
                    cand_path = cand["path"]
                    if os.path.exists(cand_path):
                        try:
                            os.remove(cand_path)
                        except Exception:
                            pass
                if os.path.exists(cropped_path):
                    try:
                        os.remove(cropped_path)
                    except Exception:
                        pass
                if os.path.exists(input_file_path):
                    try:
                        os.remove(input_file_path)
                    except Exception:
                        pass
                # Delete the specific output folder created by Audiveris for successful run
                if successful_candidate:
                    cand_base = os.path.splitext(os.path.basename(successful_candidate["path"]))[0]
                    job_output_folder = os.path.join(self.outputs_dir, cand_base)
                    if os.path.exists(job_output_folder):
                        try:
                            shutil.rmtree(job_output_folder)
                        except Exception:
                            pass
            else:
                print("[scanner_service] Failure detected. Keeping temporary files and Audiveris outputs for OMR debugging.")

    def _analyze_console_log(self, preprocessed_filename):
        """Parse console logs for exact Java exception causes (OOM, missing files, Tesseract errors)."""
        import glob
        base_name = os.path.splitext(preprocessed_filename)[0]
        log_pattern = os.path.join(self.outputs_dir, f"{base_name}*.log")
        found_logs = glob.glob(log_pattern)
        
        job_output_folder = os.path.join(self.outputs_dir, base_name)
        if os.path.exists(job_output_folder):
            log_pattern_sub = os.path.join(job_output_folder, "*.log")
            found_logs.extend(glob.glob(log_pattern_sub))
            
        for log_path in found_logs:
            try:
                with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    if "java.lang.OutOfMemoryError" in content:
                        return "OMR processing failed due to JVM Out of Memory error. The image may be too large."
                    elif "Tesseract" in content and "Error opening data file" in content:
                        return "OCR engine initialization failed. Please check Audiveris Tesseract installation."
                    elif "NullPointerException" in content:
                        return "OMR processing failed due to internal NullPointerException during symbol extraction."
            except Exception:
                pass
        return None

    def _analyze_omr_project(self, omr_path):
        """Extract and parse OMR archive file to evaluate exact stage of failure."""
        import zipfile
        
        diagnostics = {
            "steps": [],
            "invalid": False,
            "staves": 0,
            "systems": 0,
            "measures": 0,
            "glyphs": 0,
            "clefs": 0,
            "keys": 0,
            "times": 0,
            "notes": 0,
            "stems": 0,
            "rests": 0,
            "stage_failed": "unknown",
            "detailed_error": "OMR processing failed."
        }
        
        if not os.path.exists(omr_path):
            diagnostics["detailed_error"] = "OMR project file (.omr) was not generated."
            return diagnostics

        try:
            with zipfile.ZipFile(omr_path, 'r') as z:
                names = z.namelist()
                
                # 1. Parse book.xml to get steps reached and invalid flag
                if "book.xml" in names:
                    book_xml = z.read("book.xml").decode("utf-8")
                    root = ET.fromstring(book_xml)
                    sheet_elem = root.find(".//sheet")
                    if sheet_elem is not None:
                        diagnostics["invalid"] = sheet_elem.attrib.get("invalid", "false").lower() == "true"
                        steps_elem = sheet_elem.find("steps")
                        if steps_elem is not None and steps_elem.text:
                            diagnostics["steps"] = [s.strip() for s in steps_elem.text.split() if s.strip()]
                
                # 2. Parse sheet xml to count elements
                sheet_paths = [n for n in names if n.endswith(".xml") and "sheet#" in n]
                if sheet_paths:
                    sheet_xml = z.read(sheet_paths[0]).decode("utf-8")
                    s_root = ET.fromstring(sheet_xml)
                    
                    diagnostics["staves"] = len(s_root.findall(".//staff"))
                    diagnostics["systems"] = len(s_root.findall(".//system"))
                    diagnostics["measures"] = len(s_root.findall(".//measure"))
                    
                    glyphs = s_root.findall(".//glyph")
                    diagnostics["glyphs"] = len(glyphs)
                    
                    # Count specific shapes/types of glyphs
                    for g in glyphs:
                        shape = g.attrib.get("shape", "").lower()
                        if "clef" in shape:
                            diagnostics["clefs"] += 1
                        elif "key" in shape or "flat" in shape or "sharp" in shape or "natural" in shape:
                            diagnostics["keys"] += 1
                        elif "time" in shape or "meter" in shape:
                            diagnostics["times"] += 1
                        elif "head" in shape or "note" in shape:
                            diagnostics["notes"] += 1
                        elif "stem" in shape:
                            diagnostics["stems"] += 1
                        elif "rest" in shape:
                            diagnostics["rests"] += 1

            # 3. Determine stage of failure based on steps and counts
            steps = diagnostics["steps"]
            if not steps:
                diagnostics["stage_failed"] = "Image"
                diagnostics["detailed_error"] = "Audiveris failed to load or preprocess the image."
            elif steps == ["LOAD", "BINARY"]:
                diagnostics["stage_failed"] = "Staff Detection"
                diagnostics["detailed_error"] = "No valid staff system detected. Audiveris could not locate musical staves."
            elif "GRID" not in steps:
                diagnostics["stage_failed"] = "Staff Detection"
                diagnostics["detailed_error"] = "No valid staff system detected."
            elif diagnostics["staves"] == 0 or diagnostics["systems"] == 0:
                diagnostics["stage_failed"] = "System Detection"
                diagnostics["detailed_error"] = "No valid staff system detected."
            elif "HEADERS" not in steps:
                diagnostics["stage_failed"] = "Headers Detection"
                diagnostics["detailed_error"] = "Clef detection failed."
            elif diagnostics["clefs"] == 0:
                diagnostics["stage_failed"] = "Symbol Recognition"
                diagnostics["detailed_error"] = "Clef detection failed."
            elif "STEMS" not in steps or "HEADS" not in steps:
                diagnostics["stage_failed"] = "Symbol Recognition"
                diagnostics["detailed_error"] = "Symbol recognition failed or noteheads not detected."
            elif "MEASURES" not in steps or diagnostics["measures"] == 0:
                diagnostics["stage_failed"] = "Measure Segmentation"
                diagnostics["detailed_error"] = "Measure segmentation failed."
            elif "RHYTHMS" not in steps:
                diagnostics["stage_failed"] = "Rhythm Analysis"
                diagnostics["detailed_error"] = "Rhythm analysis incomplete."
            else:
                diagnostics["stage_failed"] = "MusicXML Export"
                diagnostics["detailed_error"] = "Export aborted because the score is structurally incomplete."
                
        except Exception as parse_err:
            print(f"[scanner_service] Error analyzing OMR project: {parse_err}")
            diagnostics["detailed_error"] = f"OMR project parsing failed: {str(parse_err)}"
            
        return diagnostics

    def _preserve_debug_files(self, job_id, input_file_path, preprocessed_path, preprocessed_filename, omr_path):
        """Copy all intermediate job artifacts to a permanent debug directory on failure."""
        import glob
        try:
            debug_job_dir = os.path.join(self.base_dir, "debug_omr", f"job_{job_id}")
            os.makedirs(debug_job_dir, exist_ok=True)
            
            print(f"[scanner_service] Preserving debug files on failure to: {debug_job_dir}")
            
            # 1. Original image
            if os.path.exists(input_file_path):
                shutil.copy2(input_file_path, os.path.join(debug_job_dir, "original" + os.path.splitext(input_file_path)[1]))
                
            # 2. Preprocessed image
            if os.path.exists(preprocessed_path):
                shutil.copy2(preprocessed_path, os.path.join(debug_job_dir, "preprocessed" + os.path.splitext(preprocessed_path)[1]))
                
            # 3. Project OMR file
            if os.path.exists(omr_path):
                shutil.copy2(omr_path, os.path.join(debug_job_dir, "project.omr"))
                
            # 4. Look for generated MXL/XML files
            job_output_folder = os.path.join(self.outputs_dir, os.path.splitext(preprocessed_filename)[0])
            possible_mxl = os.path.join(job_output_folder, f"{os.path.splitext(preprocessed_filename)[0]}.mxl")
            if os.path.exists(possible_mxl):
                shutil.copy2(possible_mxl, os.path.join(debug_job_dir, "partial_score.mxl"))
                
            # 5. Look for log files
            log_pattern = os.path.join(self.outputs_dir, f"{os.path.splitext(preprocessed_filename)[0]}*.log")
            for log_file in glob.glob(log_pattern):
                shutil.copy2(log_file, os.path.join(debug_job_dir, os.path.basename(log_file)))
            if os.path.exists(job_output_folder):
                log_pattern_sub = os.path.join(job_output_folder, "*.log")
                for log_file in glob.glob(log_pattern_sub):
                    shutil.copy2(log_file, os.path.join(debug_job_dir, os.path.basename(log_file)))
                    
            print(f"[scanner_service] Debug preservation complete.")
        except Exception as debug_err:
            print(f"[scanner_service] Failed to preserve debug files: {debug_err}")

    def classify_omr_error(self, e, stage, dimensions, quality_warning, diagnostics=None):
        """
        Classifies Audiveris and validation errors into user-friendly messages,
        and logs diagnostic OMR metrics in development mode.
        """
        if isinstance(e, OMRRecognitionError):
            return e
            
        err_str = str(e).lower()
        original_err = str(e)
        
        # Use structural diagnostics if available to produce precise, detailed error messages
        if diagnostics and diagnostics.get("detailed_error"):
            user_msg = diagnostics["detailed_error"]
        else:
            # Fallback classification rules
            if "too low interline" in err_str or "interline" in err_str or "spacing too small" in err_str:
                user_msg = "The detected staff lines are too close together. Try using a higher-resolution image."
            elif "no staves" in err_str or "no multi-line staves" in err_str or "sheetstub 411" in err_str:
                user_msg = "No complete musical staff could be detected in the image."
            elif "invalid sheet" in err_str or "not a music sheet" in err_str:
                user_msg = "The image does not appear to contain a valid music sheet."
            elif "could not export" in err_str or "export failed" in err_str:
                user_msg = "No valid staff system detected."
            elif "no musical notes were detected" in err_str:
                user_msg = "No musical notes were detected. Please use a clearer, higher-resolution image or retake the photo."
            elif stage == "preparing":
                user_msg = "The image preprocessing step failed."
            else:
                user_msg = "The music sheet could not be recognized. See backend logs for details."
            
        # Append lighting warning ONLY if exposure/contrast check indicated issues
        if quality_warning:
            user_msg += " Please check the lighting and contrast."
            
        # Development diagnostic logging
        print(f"\n[DEVELOPMENT LOG] OMR Execution Failure:")
        print(f"  - Original Audiveris Error: {original_err}")
        print(f"  - Recognition Stage: {stage}")
        print(f"  - Image Dimensions: {dimensions[0]}x{dimensions[1]}")
        if diagnostics:
            print(f"  - Calculated Stage of Failure: {diagnostics.get('stage_failed')}")
            print(f"  - Steps Reached: {diagnostics.get('steps')}")
            print(f"  - Number of Detected Staves: {diagnostics.get('staves')}")
            print(f"  - Number of Detected Systems: {diagnostics.get('systems')}")
            print(f"  - Number of Detected Measures: {diagnostics.get('measures')}")
            print(f"  - Number of Detected Glyphs: {diagnostics.get('glyphs')} (Clefs: {diagnostics.get('clefs')}, Notes: {diagnostics.get('notes')}, Rests: {diagnostics.get('rests')})")
        else:
            print(f"  - Number of Detected Staves: 0 (or failed to parse)")
            print(f"  - Number of Detected Systems: 0 (or failed to parse)")
            print(f"  - Notes Recognized: False (0 notes)")
        print(f"  - Exposure/Contrast Warning: {quality_warning}\n")
        
        return OMRRecognitionError(user_msg)
