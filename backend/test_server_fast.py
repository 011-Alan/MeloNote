import requests
import json
import time

url = "http://127.0.0.1:5000/analyze"
audio_file = "universfield-dramatic-sorrow-piano-15s-159310.mp3"

print(f"Sending request for {audio_file} to /analyze (preset=fast) ...")
start_time = time.time()
with open(audio_file, "rb") as f:
    files = {"audio": (audio_file, f, "audio/mpeg")}
    resp = requests.post(url, files=files, data={
        "speed_preset": "fast",
        "use_pitch_refinement": "false",
        "use_ensemble": "false"
    }, timeout=300)
end_time = time.time()

print(f"Request finished in {end_time - start_time:.2f} seconds.")

if resp.status_code == 200:
    data = resp.json()
    print(f"Success: {data.get('success')}")
    print(f"Tempo:   {data.get('detected_tempo')} BPM")
    print(f"TimeSig: {data.get('time_signature')}")
    print(f"Notes:   {len(data.get('notes', []))}")
    
    print("\nQuality Scores:")
    qs = data.get("quality_scores", {})
    for k, v in qs.items():
        print(f"  {k:<20}: {v}")
else:
    print(f"Error: HTTP {resp.status_code}")
    print(resp.text[:1000])
