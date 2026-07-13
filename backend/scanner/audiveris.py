import os
import subprocess
import sys
import glob

# Default path to Audiveris installer on Windows
DEFAULT_AUDIVERIS_PATH = r"C:\Program Files\Audiveris\Audiveris.exe"

class AudiverisWrapper:
    def __init__(self, executable_path=None):
        self.executable_path = executable_path or DEFAULT_AUDIVERIS_PATH
        
    def check_executable(self):
        """Check if the Audiveris executable exists at the specified path."""
        if not os.path.exists(self.executable_path):
            raise FileNotFoundError(
                f"Audiveris executable not found at: '{self.executable_path}'. "
                "Please verify that Audiveris is installed and the path is correct."
            )
            
    def run_omr(self, input_image_path, output_dir):
        """
        Execute Audiveris OMR on the input image.
        
        Args:
            input_image_path (str): Path to the binarized sheet music image.
            output_dir (str): Base folder where output files will be written.
            
        Returns:
            str: Path to the generated MXL file.
        """
        self.check_executable()
        
        if not os.path.exists(input_image_path):
            raise FileNotFoundError(f"Input image path does not exist: {input_image_path}")
            
        os.makedirs(output_dir, exist_ok=True)
        
        # Build command: audiveris -batch -export -output <output_dir> <input_image_path>
        cmd = [
            self.executable_path,
            "-batch",
            "-export",
            "-output",
            output_dir,
            input_image_path
        ]
        
        print(f"[audiveris] Running OMR: {' '.join(cmd)}")
        
        # Run Audiveris and capture output
        filename = os.path.basename(input_image_path)
        base_name, _ = os.path.splitext(filename)
        job_output_folder = os.path.join(output_dir, base_name)
        os.makedirs(job_output_folder, exist_ok=True)
        console_log_path = os.path.join(job_output_folder, f"{base_name}_console.log")

        try:
            # Set creationflags=subprocess.CREATE_NO_WINDOW on Windows to prevent popping a cmd shell window
            creationflags = 0
            if sys.platform == "win32":
                creationflags = subprocess.CREATE_NO_WINDOW
                
            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=True,
                creationflags=creationflags,
                timeout=120 # 2 minute timeout for a single page sheet scan
            )
            
            print("[audiveris] Audiveris finished successfully.")
            
            # Save logs on success
            with open(console_log_path, 'w', encoding='utf-8') as log_f:
                log_f.write("=== STDOUT ===\n")
                log_f.write(result.stdout or "")
                log_f.write("\n=== STDERR ===\n")
                log_f.write(result.stderr or "")
                
        except subprocess.TimeoutExpired as e:
            raise RuntimeError("Audiveris OMR execution timed out (exceeded 120 seconds).") from e
        except subprocess.CalledProcessError as e:
            error_msg = e.stderr or e.stdout or "Unknown CalledProcessError"
            print(f"[audiveris] Audiveris failed with exit code {e.returncode}")
            print(f"[audiveris] Error output:\n{error_msg}")
            
            # Save logs on failure
            try:
                with open(console_log_path, 'w', encoding='utf-8') as log_f:
                    log_f.write("=== STDOUT ===\n")
                    log_f.write(e.stdout or "")
                    log_f.write("\n=== STDERR ===\n")
                    log_f.write(e.stderr or "")
            except Exception as log_err:
                print(f"[audiveris] Failed to save console log on failure: {log_err}")
                
            # Self-healing OMR recovery check for metronome export NullPointerException
            is_metronome_npe = (
                "BeatUnitInter$Note.toMusicXml()" in error_msg or 
                "PartwiseBuilder.processDirection" in error_msg
            )
            
            if is_metronome_npe:
                omr_path = os.path.join(output_dir, f"{base_name}.omr")
                if os.path.exists(omr_path):
                    repaired = self._repair_omr_file(omr_path)
                    if repaired:
                        # Re-run Audiveris with the repaired OMR file to export MusicXML
                        export_cmd = [
                            self.executable_path,
                            "-batch",
                            "-export",
                            "-output",
                            output_dir,
                            omr_path
                        ]
                        print(f"[audiveris] Re-running Audiveris export on repaired OMR: {' '.join(export_cmd)}")
                        try:
                            export_result = subprocess.run(
                                export_cmd,
                                stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE,
                                text=True,
                                check=True,
                                creationflags=creationflags,
                                timeout=60
                            )
                            print("[audiveris] Self-healing export completed successfully.")
                            # Save repaired logs
                            try:
                                with open(console_log_path, 'w', encoding='utf-8') as log_f:
                                    log_f.write("=== REPAIRED STDOUT ===\n")
                                    log_f.write(export_result.stdout or "")
                                    log_f.write("\n=== REPAIRED STDERR ===\n")
                                    log_f.write(export_result.stderr or "")
                            except Exception:
                                pass
                                
                            # Locate the newly generated MXL file
                            return self._locate_mxl_file(input_image_path, output_dir)
                        except Exception as export_err:
                            print(f"[audiveris] Re-running export failed: {export_err}")
            
            raise RuntimeError(
                f"Audiveris OMR execution failed with exit code {e.returncode}. Details: {error_msg.strip()}"
            ) from e
        except Exception as e:
            raise RuntimeError(f"Failed to start Audiveris subprocess: {str(e)}") from e
            
        return self._locate_mxl_file(input_image_path, output_dir)

    def _repair_omr_file(self, omr_path):
        """Repair OMR project by stripping incomplete metronome nodes."""
        import zipfile
        import xml.etree.ElementTree as ET
        
        temp_omr_path = omr_path + ".tmp"
        try:
            print(f"[audiveris] Attempting self-healing OMR repair on: {omr_path}")
            with zipfile.ZipFile(omr_path, 'r') as z_in:
                with zipfile.ZipFile(temp_omr_path, 'w') as z_out:
                    for item in z_in.infolist():
                        data = z_in.read(item.filename)
                        if item.filename.endswith(".xml") and "sheet#" in item.filename:
                            try:
                                root = ET.fromstring(data.decode("utf-8"))
                                metronome_nodes = root.findall(".//metronome")
                                if metronome_nodes:
                                    print(f"[audiveris] Removing {len(metronome_nodes)} metronome nodes from {item.filename}")
                                    parent_map = {c: p for p in root.iter() for c in p}
                                    for node in metronome_nodes:
                                        parent = parent_map.get(node)
                                        if parent is not None:
                                            parent.remove(node)
                                    data = ET.tostring(root, encoding="utf-8")
                            except Exception as xml_err:
                                print(f"[audiveris] Error parsing OMR XML {item.filename}: {xml_err}")
                        z_out.writestr(item, data)
                        
            # Replace original OMR with the repaired OMR
            os.replace(temp_omr_path, omr_path)
            print("[audiveris] Self-healing OMR repair successful.")
            return True
        except Exception as e:
            print(f"[audiveris] Self-healing OMR repair failed: {e}")
            if os.path.exists(temp_omr_path):
                try:
                    os.remove(temp_omr_path)
                except Exception:
                    pass
            return False

    def _locate_mxl_file(self, input_image_path, output_dir):
        """Locate output MXL file produced by Audiveris."""
        filename = os.path.basename(input_image_path)
        base_name, _ = os.path.splitext(filename)
        
        expected_mxl_path = os.path.join(output_dir, base_name, f"{base_name}.mxl")
        if os.path.exists(expected_mxl_path):
            return expected_mxl_path
            
        fallback_pattern = os.path.join(output_dir, "**", f"{base_name}.mxl")
        found_files = glob.glob(fallback_pattern, recursive=True)
        if found_files:
            return found_files[0]
            
        any_mxl_pattern = os.path.join(output_dir, "**", "*.mxl")
        found_any = glob.glob(any_mxl_pattern, recursive=True)
        if found_any:
            return found_any[0]
            
        raise FileNotFoundError(
            f"Audiveris completed but could not find the expected MXL file inside: {output_dir}"
        )

    def run_export_recovery(self, omr_path, output_dir, console_log_path):
        """
        Unflag the OMR project as invalid (if staves are present) and re-export MusicXML.
        """
        import zipfile
        import xml.etree.ElementTree as ET
        import sys
        
        temp_omr_path = omr_path + ".unflagged"
        repaired = False
        try:
            print(f"[audiveris] Attempting export recovery. Unflagging invalid project: {omr_path}")
            with zipfile.ZipFile(omr_path, 'r') as z_in:
                names = z_in.namelist()
                if "book.xml" not in names:
                    return False
                    
                sheet_xml_paths = [n for n in names if n.endswith(".xml") and "sheet#" in n]
                if not sheet_xml_paths:
                    print("[audiveris] Recovery aborted: No sheet XML found in project.")
                    return False
                    
                sheet_data = z_in.read(sheet_xml_paths[0]).decode("utf-8")
                sheet_root = ET.fromstring(sheet_data)
                staves_count = len(sheet_root.findall(".//staff"))
                if staves_count == 0:
                    print("[audiveris] Recovery aborted: No staves detected in sheet XML.")
                    return False
                    
                with zipfile.ZipFile(temp_omr_path, 'w') as z_out:
                    for item in z_in.infolist():
                        data = z_in.read(item.filename)
                        if item.filename == "book.xml":
                            content = data.decode("utf-8")
                            content = content.replace('invalid="true"', 'invalid="false"')
                            data = content.encode("utf-8")
                        elif item.filename.endswith(".xml") and "sheet#" in item.filename:
                            try:
                                root = ET.fromstring(data.decode("utf-8"))
                                metronome_nodes = root.findall(".//metronome")
                                if metronome_nodes:
                                    print(f"[audiveris] Removing {len(metronome_nodes)} metronome nodes during unflag recovery.")
                                    parent_map = {c: p for p in root.iter() for c in p}
                                    for node in metronome_nodes:
                                        parent = parent_map.get(node)
                                        if parent is not None:
                                            parent.remove(node)
                                    data = ET.tostring(root, encoding="utf-8")
                            except Exception as xml_err:
                                print(f"[audiveris] Error parsing XML during recovery: {xml_err}")
                        z_out.writestr(item, data)
            
            os.replace(temp_omr_path, omr_path)
            repaired = True
        except Exception as e:
            print(f"[audiveris] Unflagging OMR project failed: {e}")
            if os.path.exists(temp_omr_path):
                os.remove(temp_omr_path)
            return False
            
        if repaired:
            export_cmd = [
                self.executable_path,
                "-batch",
                "-export",
                "-output",
                output_dir,
                omr_path
            ]
            print(f"[audiveris] Re-running Audiveris unflagged export: {' '.join(export_cmd)}")
            try:
                creationflags = 0
                if sys.platform == "win32":
                    creationflags = subprocess.CREATE_NO_WINDOW
                    
                export_result = subprocess.run(
                    export_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    check=True,
                    creationflags=creationflags,
                    timeout=60
                )
                print("[audiveris] Recovery export completed successfully.")
                try:
                    with open(console_log_path, 'w', encoding='utf-8') as log_f:
                        log_f.write("=== RECOVERED STDOUT ===\n")
                        log_f.write(export_result.stdout or "")
                        log_f.write("\n=== RECOVERED STDERR ===\n")
                        log_f.write(export_result.stderr or "")
                except Exception:
                    pass
                return True
            except Exception as export_err:
                print(f"[audiveris] Recovery export failed: {export_err}")
        return False
