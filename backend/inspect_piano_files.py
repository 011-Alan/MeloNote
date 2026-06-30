# -*- coding: utf-8 -*-
import os
import sys
import numpy as np
import librosa

backend_path = r"C:\ReactNative\music-app\MeloNote\backend"
if backend_path not in sys.path:
    sys.path.append(backend_path)

from analyze import analyze_audio
from evaluate import _estimate_pitch_accuracy_from_chroma

def pitch_name_to_midi(pitch_name):
    NOTES = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
    # Find index of the digit representing octave
    for i, char in enumerate(pitch_name):
        if char.isdigit() or char == '-':
            name = pitch_name[:i]
            octave = int(pitch_name[i:])
            break
    else:
        name = pitch_name
        octave = 4
    return (octave + 1) * 12 + NOTES[name]

files = ["piano-a_A_major.wav", "u_c58whxla22-a-piano-a4-422104.mp3"]

for fname in files:
    filepath = os.path.join(backend_path, fname)
    if not os.path.exists(filepath):
        print(f"File {fname} not found!")
        continue
    audio, sr = librosa.load(filepath, sr=16000, mono=True)
    
    # Run analyze_audio
    res = analyze_audio(filepath)
    notes = res.get("notes", [])
    print(f"\n--- {fname} ---")
    print(f"Detected notes count: {len(notes)}")
    for note in notes[:5]:
        print(f"  Note: {note}")
        
    # Get chroma features using the updated energy-gating + neighbor suppression
    chroma = librosa.feature.chroma_cqt(y=audio, sr=sr, hop_length=512)
    frame_energies = np.sum(chroma, axis=0)
    max_frame_energy = np.max(frame_energies)
    if max_frame_energy > 0:
        active_frames = chroma[:, frame_energies >= 0.15 * max_frame_energy]
        if active_frames.shape[1] > 0:
            chroma_mean = np.mean(active_frames, axis=1)
        else:
            chroma_mean = np.mean(chroma, axis=1)
    else:
        chroma_mean = np.mean(chroma, axis=1)
        
    max_energy = np.max(chroma_mean)
    top_classes_orig = set()
    if max_energy > 0:
        raw_candidates = np.where(chroma_mean >= 0.30 * max_energy)[0]
        for p in raw_candidates:
            is_leakage = False
            for neighbor in [(p - 1) % 12, (p + 1) % 12]:
                if chroma_mean[neighbor] > chroma_mean[p] and chroma_mean[p] < 0.60 * chroma_mean[neighbor]:
                    is_leakage = True
                    break
            if not is_leakage:
                top_classes_orig.add(p)
                
    print(f"Top orig classes (with gating & leakage suppression): {top_classes_orig}")
    
    # Sort and print all 12 classes with relative energy
    sorted_classes = sorted([(i, val / max_energy) for i, val in enumerate(chroma_mean)], key=lambda x: x[1], reverse=True)
    print("Class relative energies:")
    for pitch_class, rel_energy in sorted_classes:
        print(f"  Class {pitch_class:2d}: {rel_energy:.3f}")
        
    detected_classes = set()
    for ev in notes:
        pitches = ev['pitch'].split(',')
        for p in pitches:
            detected_classes.add(pitch_name_to_midi(p) % 12)
            
    print(f"Detected classes: {detected_classes}")
    
    overlap = len(detected_classes & top_classes_orig)
    precision = overlap / len(detected_classes) if detected_classes else 0.0
    recall = overlap / len(top_classes_orig) if top_classes_orig else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    print(f"Refined Pitch Accuracy: {f1 * 100:.2f}%")
