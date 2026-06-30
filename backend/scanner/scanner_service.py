import os
import shutil
import uuid
import xml.etree.ElementTree as ET
from scanner.preprocess import preprocess_sheet_music, OMRRecognitionError
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
          1. Preprocess the image (grayscale, crop page, perspective warp, spacing check, resize).
          2. Execute Audiveris OMR.
          3. Parse and validate the output MusicXML.
          4. Clean up temporary files.
          
        Args:
            input_file_path (str): Path to the saved user upload.
            on_stage_change (callable): Optional callback for progress tracking.
            
        Returns:
            str: Validated MusicXML content.
        """
        def notify(stage):
            if on_stage_change:
                on_stage_change(stage)

        if not os.path.exists(input_file_path):
            raise FileNotFoundError(f"Uploaded file not found: {input_file_path}")
            
        # Create unique filename tokens for temporary stages
        job_id = str(uuid.uuid4())
        original_name = os.path.basename(input_file_path)
        base_name, ext = os.path.splitext(original_name)
        
        # Output locations
        cropped_filename = f"{base_name}_cropped_{job_id}{ext}"
        cropped_path = os.path.join(self.temp_dir, cropped_filename)
        
        preprocessed_filename = f"{base_name}_clean_{job_id}{ext}"
        preprocessed_path = os.path.join(self.temp_dir, preprocessed_filename)
        
        # Initialize default metrics for development logging
        stage = "uploading"
        dimensions = (0, 0)
        quality_warning = False
        
        try:
            print(f"[scanner_service] === BEGIN OMR SCAN PIPELINE ===")
            print(f"[scanner_service] Uploaded image path: {input_file_path}")
            
            # Step 1: Preprocess image using OpenCV (Crop page, Warp, Denoise, Enhance, Binarize)
            stage = "preparing"
            notify("preparing")
            print(f"[scanner_service] Preprocessing image to: {preprocessed_path}")
            
            # Preprocess returns preprocessed_path, exposure/contrast check, and low_res check
            _, quality_warning, low_res_warning = preprocess_sheet_music(
                input_file_path,
                preprocessed_path,
                cropped_path=cropped_path,
                on_stage_change=on_stage_change
            )
            
            # Retrieve cropped image dimensions for logs
            if os.path.exists(cropped_path):
                print(f"[scanner_service] Cropped image path: {cropped_path}")
                try:
                    import cv2
                    cropped_img = cv2.imread(cropped_path, cv2.IMREAD_GRAYSCALE)
                    if cropped_img is not None:
                        dimensions = (cropped_img.shape[1], cropped_img.shape[0])
                except Exception as dim_err:
                    print(f"[scanner_service] Failed to read cropped dimensions: {dim_err}")
                    
            print(f"[scanner_service] Preprocessed image path: {preprocessed_path}")
            
            # Step 2: Run OMR (Audiveris) on the clean binary image
            stage = "recognizing_symbols"
            notify("recognizing_symbols")
            print(f"[scanner_service] Running Audiveris OMR on: {preprocessed_filename}")
            mxl_output_path = self.audiveris_wrapper.run_omr(preprocessed_path, self.outputs_dir)
            print(f"[scanner_service] Audiveris output path: {mxl_output_path}")
            
            # Step 3: Parse and validate the resulting MusicXML/MXL file
            stage = "generating_xml"
            notify("generating_xml")
            print(f"[scanner_service] Parsing and validating generated MXL: {mxl_output_path}")
            musicxml_content = MusicXMLParser.process_and_validate(mxl_output_path)
            
            # Gather successful metrics for logging (Issue 5)
            num_staves = 0
            num_systems = 0
            note_count = 0
            has_notes = False
            
            try:
                root = ET.fromstring(musicxml_content)
                note_tags = root.findall(".//note")
                note_count = len(note_tags)
                has_notes = note_count > 0
                
                # In MusicXML, <staves> inside attributes tells the number of staves
                staves_elem = root.find(".//staves")
                if staves_elem is not None:
                    num_staves = int(staves_elem.text)
                else:
                    # Fallback count unique staff IDs
                    staff_ids = {n.find("staff").text for n in note_tags if n.find("staff") is not None}
                    num_staves = len(staff_ids) if staff_ids else 1
                    
                # In MusicXML, systems are separated by <print new-system="yes"/> or measure systems
                # We can count new systems by counting print tags with new-system attributes, plus 1 (first system)
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
                
            print(f"[scanner_service] === END OMR SCAN PIPELINE SUCCESS ===")
            return musicxml_content, low_res_warning
            
        except Exception as e:
            print(f"[scanner_service] === END OMR SCAN PIPELINE FAILURE: {str(e)} ===")
            
            # Parse error and perform intelligent classification (Issue 5)
            classified_error = self.classify_omr_error(e, stage, dimensions, quality_warning)
            raise classified_error
            
        finally:
            # Step 4: Clean up temporary files and OMR folder to keep system clean
            print("[scanner_service] Cleaning up temporary job files...")
            
            # Delete preprocessed image
            if os.path.exists(preprocessed_path):
                try:
                    os.remove(preprocessed_path)
                except Exception as e:
                    print(f"Error deleting temp preprocessed file: {e}")
                    
            # Delete cropped image
            if os.path.exists(cropped_path):
                try:
                    os.remove(cropped_path)
                except Exception as e:
                    print(f"Error deleting temp cropped file: {e}")
                    
            # Delete original uploaded file
            if os.path.exists(input_file_path):
                try:
                    os.remove(input_file_path)
                except Exception as e:
                    print(f"Error deleting temp input file: {e}")
                    
            # Delete the specific output folder created by Audiveris for this preprocessed image
            job_output_folder = os.path.join(self.outputs_dir, os.path.splitext(preprocessed_filename)[0])
            if os.path.exists(job_output_folder):
                try:
                    shutil.rmtree(job_output_folder)
                except Exception as e:
                    print(f"Error deleting job output folder {job_output_folder}: {e}")

    def classify_omr_error(self, e, stage, dimensions, quality_warning):
        """
        Classifies Audiveris and validation errors into user-friendly messages,
        and logs diagnostic OMR metrics in development mode.
        """
        if isinstance(e, OMRRecognitionError):
            return e
            
        err_str = str(e).lower()
        original_err = str(e)
        
        # Classification rules (Issue 5)
        if "too low interline" in err_str or "interline" in err_str or "spacing too small" in err_str:
            user_msg = "The detected staff lines are too close together. Try using a higher-resolution image."
        elif "no staves" in err_str or "no multi-line staves" in err_str or "sheetstub 411" in err_str:
            user_msg = "No complete musical staff could be detected in the image."
        elif "invalid sheet" in err_str or "not a music sheet" in err_str:
            user_msg = "The image does not appear to contain a valid music sheet."
        elif "could not export" in err_str or "export failed" in err_str:
            user_msg = "Musical symbols were detected, but MusicXML generation was unsuccessful."
        elif "no musical notes were detected" in err_str:
            user_msg = "No musical notes were detected. Please use a clearer, higher-resolution image or retake the photo."
        elif stage == "preparing":
            user_msg = "The image preprocessing step failed."
        else:
            user_msg = "The music sheet could not be recognized. See backend logs for details."
            
        # Append lighting warning ONLY if exposure/contrast check indicated issues
        if quality_warning:
            user_msg += " Please check the lighting and contrast."
            
        # Development diagnostic logging (Issue 5)
        print(f"\n[DEVELOPMENT LOG] OMR Execution Failure:")
        print(f"  - Original Audiveris Error: {original_err}")
        print(f"  - Recognition Stage: {stage}")
        print(f"  - Image Dimensions: {dimensions[0]}x{dimensions[1]}")
        print(f"  - Number of Detected Staves: 0 (or failed to parse)")
        print(f"  - Number of Detected Systems: 0 (or failed to parse)")
        print(f"  - Notes Recognized: False (0 notes)")
        print(f"  - Exposure/Contrast Warning: {quality_warning}\n")
        
        return OMRRecognitionError(user_msg)
