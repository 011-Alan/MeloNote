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
            
        except subprocess.TimeoutExpired as e:
            raise RuntimeError("Audiveris OMR execution timed out (exceeded 120 seconds).") from e
        except subprocess.CalledProcessError as e:
            error_msg = e.stderr or e.stdout or "Unknown CalledProcessError"
            print(f"[audiveris] Audiveris failed with exit code {e.returncode}")
            print(f"[audiveris] Error output:\n{error_msg}")
            raise RuntimeError(
                f"Audiveris OMR execution failed with exit code {e.returncode}. Details: {error_msg.strip()}"
            ) from e
        except Exception as e:
            raise RuntimeError(f"Failed to start Audiveris subprocess: {str(e)}") from e
            
        # Locate output MXL file
        # Audiveris output structure: <output_dir>/<image_filename_without_ext>/<image_filename_without_ext>.mxl
        filename = os.path.basename(input_image_path)
        base_name, _ = os.path.splitext(filename)
        
        expected_mxl_path = os.path.join(output_dir, base_name, f"{base_name}.mxl")
        
        if os.path.exists(expected_mxl_path):
            return expected_mxl_path
            
        # Fallback: scan output_dir recursively for any .mxl file matching the name in case folder layout differs
        fallback_pattern = os.path.join(output_dir, "**", f"{base_name}.mxl")
        found_files = glob.glob(fallback_pattern, recursive=True)
        if found_files:
            return found_files[0]
            
        # Fallback 2: Look for any .mxl or .xml file in the output directory
        any_mxl_pattern = os.path.join(output_dir, "**", "*.mxl")
        found_any = glob.glob(any_mxl_pattern, recursive=True)
        if found_any:
            return found_any[0]
            
        raise FileNotFoundError(
            f"Audiveris completed but could not find the expected MXL file inside: {output_dir}"
        )
