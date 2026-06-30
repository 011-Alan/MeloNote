import json
from analyze import analyze_audio

r = analyze_audio("tyler.wav")
xml = r["musicxml"]
with open("tyler.musicxml", "w", encoding="utf-8") as f:
    f.write(xml)

print("Wrote tyler.musicxml successfully!")
