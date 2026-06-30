# -*- coding: utf-8 -*-
# run_all_audio_pitch_evaluation.py - Evaluate pitch accuracy across all audio files in the backend

import os
import glob
import sys
import numpy as np
import librosa

backend_path = r"C:\ReactNative\music-app\MeloNote\backend"
if backend_path not in sys.path:
    sys.path.append(backend_path)

from analyze import _get_transcriber, analyze_audio
from evaluate import evaluate_round_trip

def discover_audio_files():
    patterns = ["*.wav", "*.mp3"]
    files = []
    for pat in patterns:
        files.extend(glob.glob(os.path.join(backend_path, pat)))
    # Exclude temp files or known non-music files
    excluded_keywords = ["silence"]
    filtered_files = []
    seen_sizes = set()
    for f in files:
        basename = os.path.basename(f)
        if any(kw in basename for kw in excluded_keywords):
            continue
        size = os.path.getsize(f)
        # Check size to avoid zero or tiny files
        if size < 5000:
            continue
        # Deduplicate based on size
        if size in seen_sizes:
            # If the filename is tyler.wav, keep it and discard the other copy for clarity
            if basename == "tyler.wav":
                for idx, existing in enumerate(filtered_files):
                    if os.path.getsize(existing) == size:
                        filtered_files[idx] = f
                        break
            continue
        seen_sizes.add(size)
        filtered_files.append(f)
    return sorted(filtered_files)

def evaluate_file(filepath):
    print(f"\nProcessing {os.path.basename(filepath)} ...")
    try:
        # Load audio (first 30 seconds for speed consistency)
        audio, sr = librosa.load(filepath, sr=16000, mono=True)
        if len(audio) < 16000 * 0.5:
            return {"status": "skipped", "reason": "too short"}
            
        # Run analyze_audio pipeline
        res = analyze_audio(filepath)
        
        # Extract quality scores
        qs = res.get("quality_scores", {})
        pitch_acc = qs.get("pitch_accuracy", 0.0)
        
        # Check raw notes vs validated to see how many were kept
        notes = res.get("notes", [])
        tempo = res.get("detected_tempo", 120.0)
        
        return {
            "status": "success",
            "pitch_accuracy": pitch_acc,
            "tempo": tempo,
            "notes_count": len(notes),
            "overall_score": qs.get("overall_score", 0.0)
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "error": str(e)}

def main():
    audio_files = discover_audio_files()
    print(f"Found {len(audio_files)} audio files to evaluate:")
    for i, f in enumerate(audio_files, 1):
        print(f"  {i}. {os.path.basename(f)} ({os.path.getsize(f) / 1024 / 1024:.2f} MB)")
        
    results = {}
    success_count = 0
    pitch_accuracies = []
    
    for f in audio_files:
        res = evaluate_file(f)
        results[f] = res
        if res["status"] == "success":
            success_count += 1
            pitch_accuracies.append(res["pitch_accuracy"])
            
    print("\n" + "="*80)
    print("                 ALL AUDIO PITCH ACCURACY REPORT")
    print("="*80)
    print(f"{'Filename':<50} | {'Tempo':<6} | {'Notes':<6} | {'Pitch Acc':<10} | {'Overall':<8}")
    print("-"*80)
    
    low_accuracy_files = []
    for f in audio_files:
        res = results[f]
        name = os.path.basename(f)
        if res["status"] == "success":
            p_acc = res["pitch_accuracy"]
            print(f"{name:<50} | {res['tempo']:<6.1f} | {res['notes_count']:<6d} | {p_acc:<9.1f}% | {res['overall_score']:<7.1f}%")
            if p_acc < 90.0:
                low_accuracy_files.append((f, p_acc))
        elif res["status"] == "skipped":
            print(f"{name:<50} | SKIPPED ({res['reason']})")
        else:
            print(f"{name:<50} | ERROR: {res['error']}")
            
    print("="*80)
    if pitch_accuracies:
        avg_pitch = np.mean(pitch_accuracies)
        print(f"Average Pitch Accuracy across {success_count} successful files: {avg_pitch:.2f}%")
    else:
        print("No successful evaluations.")
    print("="*80)
    
    if low_accuracy_files:
        print(f"\nWARNING: {len(low_accuracy_files)} files have pitch accuracy below 90%:")
        for f, acc in low_accuracy_files:
            print(f"  - {os.path.basename(f)}: {acc:.2f}%")
    else:
        print("\nSUCCESS: All successful files have pitch accuracy >= 90%!")

if __name__ == "__main__":
    main()
