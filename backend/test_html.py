from analyze import analyze_audio
import sys
import os
import re
import json
import base64

sys.path.append(".")
import analyze

result = analyze.analyze_audio("tyler.wav")
notes = result["notes"]
time_sig = result["time_signature"]
tempo = result["detected_tempo"]
musicxml_str = result["musicxml"]

# Load sheetMusicShared.ts and extract buildSheetMusicHtml contents
with open("../src/components/sheetMusicShared.ts", "r") as f:
    shared_ts = f.read()

# Extract the HTML template from sheetMusicShared.ts
match = re.search(r"return `(<!DOCTYPE html>.*?)`;", shared_ts, re.DOTALL)
if match:
    html_template = match.group(1)
    
    NOTE_OFFSETS = {
        'A': 9, 'A#': 10, 'Ab': 8, 'B': 11, 'Bb': 10, 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'Db': 1,
        'E': 4, 'Eb': 3, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'Gb': 6
    }
    
    def map_note(note, idx):
        if note["pitch"] == "rest":
            return {
                "accidental": "",
                "clef": note.get("clef", "treble"),
                "display": "rest",
                "letter": "r",
                "octave": 0,
                "midi": 0,
                "duration": note["duration"],
                "absoluteIndex": note.get("absoluteIndex", idx),
                "pitch": "rest",
                "beats": note["beats"]
            }
        else:
            first_pitch = note["pitch"].split(",")[0]
            letter = first_pitch[0].upper()
            accidental = first_pitch[1] if len(first_pitch) > 1 and first_pitch[1] in ["#", "b"] else ""
            octave = int(first_pitch[-1]) if first_pitch[-1].isdigit() else 4
            note_name = letter + accidental
            offset = NOTE_OFFSETS.get(note_name, 0)
            midi = (octave + 1) * 12 + offset
            clef = note.get("clef", "treble" if midi >= 60 else "bass")
            
            return {
                "accidental": accidental,
                "clef": clef,
                "display": first_pitch,
                "letter": letter,
                "octave": octave,
                "midi": midi,
                "duration": note["duration"],
                "absoluteIndex": note.get("absoluteIndex", idx),
                "pitch": note["pitch"],
                "beats": note["beats"]
            }

    parsed_treble = [map_note(n, idx) for idx, n in enumerate(result["treble_notes"])]
    parsed_bass = [map_note(n, idx) for idx, n in enumerate(result["bass_notes"])]
    parsed_playback = [map_note(n, idx) for idx, n in enumerate(result["notes"])]

    payload_data = {
        "treble": parsed_treble,
        "bass": parsed_bass,
        "notes": parsed_playback
    }
    payload = json.dumps(payload_data).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    
    # Base64 encode the MusicXML string
    musicxml_base64 = base64.b64encode(musicxml_str.encode('utf-8')).decode('utf-8')

    # Replace placeholders in template
    html = html_template
    html = html.replace("${payload}", payload)
    html = html.replace("${timeSignature}", time_sig)
    html = html.replace("${detectedTempo || 120}", str(int(tempo)))
    html = html.replace("${detectedTempo}", str(int(tempo)))
    html = html.replace("${musicxmlBase64}", musicxml_base64)
    
    # Evaluate double escapes to match WebView runtime behavior
    html = html.replace("\\\\d", "\\d").replace("\\\\u", "\\u").replace("\\\\n", "\\n")
    
    with open("score.html", "w") as out:
        out.write(html)
    print("Generated score.html successfully!")
else:
    print("Could not find HTML template in sheetMusicShared.ts")
