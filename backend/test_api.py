"""Quick end-to-end API test for the Flask /analyze endpoint."""
import requests
import json
import sys

url = "http://127.0.0.1:5000/analyze"

with open("u_c58whxla22-a-piano-a4-422104.mp3", "rb") as f:
    files = {"audio": ("u_c58whxla22-a-piano-a4-422104.mp3", f, "audio/mpeg")}
    print("Sending request to /analyze ...")
    resp = requests.post(url, files=files, timeout=300)

if resp.status_code == 200:
    data = resp.json()
    print(f"Success: {data.get('success')}")
    print(f"Tempo:   {data.get('detected_tempo')} BPM")
    print(f"TimeSig: {data.get('time_signature')}")
    print(f"Notes:   {len(data.get('notes', []))}")
    print(f"Treble:  {len(data.get('treble_notes', []))}")
    print(f"Bass:    {len(data.get('bass_notes', []))}")
    print(f"MusicXML (first 300 chars):")
    print(data.get('musicxml', '')[:300])
else:
    print(f"Error: HTTP {resp.status_code}")
    print(resp.text[:500])
