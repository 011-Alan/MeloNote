# run_batch_test.py
import os
import glob
from analyze import analyze_audio

test_files = [
    "piano-a_A_major.wav",
    "universfield-dramatic-sorrow-piano-15s-159310.mp3",
    "siarhei_korbut-children-piano-short-3-382596.mp3"
]

print("=== STARTING BATCH TRANSCRIPTION TEST ===")
for f in test_files:
    if not os.path.exists(f):
        print(f"Skipping {f} (file not found)")
        continue
    
    print(f"\nTranscribing: {f} ...")
    try:
        r = analyze_audio(f)
        notes = r["notes"]
        treble = r["treble_notes"]
        bass = r["bass_notes"]
        tempo = r["detected_tempo"]
        ts = r["time_signature"]
        qs = r["quality_scores"]
        
        print(f"  Success:            True")
        print(f"  Tempo:              {tempo} BPM")
        print(f"  Time Signature:     {ts}")
        print(f"  Total Notes (flat): {len(notes)}")
        print(f"  Treble Notes:       {len(treble)}")
        print(f"  Bass Notes:         {len(bass)}")
        print(f"  Treble + Bass sum:  {len(treble) + len(bass)}")
        print(f"  Overall Quality:    {qs.get('overall_score')}%")
    except Exception as e:
        print(f"  Error transcribing {f}: {e}")

print("\n=== BATCH TEST COMPLETE ===")
