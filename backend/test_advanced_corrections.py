import sys
import os
import numpy as np

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from analyze import analyze_audio

audio_file = "universfield-dramatic-sorrow-piano-15s-159310.mp3"
print(f"Running offline analysis of {audio_file} with speed_preset='fast'...")

import time
start = time.time()
result = analyze_audio(
    audio_file,
    monophonic=False,
    mode="advanced",
    melody_priority=False,
    use_spleeter="false",
    use_pitch_refinement="false",
    use_ensemble="false",
    speed_preset="fast"
)
duration = time.time() - start
print(f"Analysis completed in {duration:.2f} seconds.")
print(f"Success: {result.get('success')}")
print(f"Tempo:   {result.get('detected_tempo')} BPM")
print(f"TimeSig: {result.get('time_signature')}")
print(f"Notes:   {len(result.get('notes', []))}")

print("\nTranscription Quality Report:")
qs = result.get("quality_scores", {})
for k, v in qs.items():
    print(f"  {k:<20}: {v}")
