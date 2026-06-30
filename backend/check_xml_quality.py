"""Quick XML quality check for the new analyze pipeline."""
from analyze import analyze_audio

r = analyze_audio("tyler.wav")
xml = r["musicxml"]

tie_start  = xml.count('tie type="start"')
tie_stop   = xml.count('tie type="stop"')
sixteenth  = xml.count("<type>16th</type>")
eighth     = xml.count("<type>eighth</type>")
quarter    = xml.count("<type>quarter</type>")
half_      = xml.count("<type>half</type>")
beams      = xml.count('<beam number=')
dots       = xml.count("<dot/>")
measures   = xml.count('<measure number=')

print(f"Tempo:      {r['detected_tempo']} BPM")
print(f"TimeSig:    {r['time_signature']}")
print(f"Measures:   {measures}")
print(f"Notes flat: {len(r['notes'])}")
print(f"Treble:     {len(r['treble_notes'])}")
print(f"Bass:       {len(r['bass_notes'])}")
print()
print("=== MusicXML Note Type Breakdown ===")
print(f"  Whole:   {xml.count('<type>whole</type>')}")
print(f"  Half:    {half_}")
print(f"  Quarter: {quarter}")
print(f"  Eighth:  {eighth}")
print(f"  16th:    {sixteenth}")
print(f"  Dots:    {dots}")
print(f"  Beams:   {beams}")
print(f"  Ties:    {tie_start} start / {tie_stop} stop")
