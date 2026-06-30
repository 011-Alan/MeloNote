# -*- coding: utf-8 -*-
import os
import sys
import numpy as np
import librosa

backend_path = r"C:\ReactNative\music-app\MeloNote\backend"
if backend_path not in sys.path:
    sys.path.append(backend_path)

from analyze import analyze_audio, _get_transcriber

def discover_audio_files():
    import glob
    patterns = ["*.wav", "*.mp3"]
    files = []
    for pat in patterns:
        files.extend(glob.glob(os.path.join(backend_path, pat)))
    excluded_keywords = ["silence"]
    filtered_files = []
    seen_sizes = set()
    for f in files:
        basename = os.path.basename(f)
        if any(kw in basename for kw in excluded_keywords):
            continue
        size = os.path.getsize(f)
        if size < 5000:
            continue
        if size in seen_sizes:
            if basename == "tyler.wav":
                for idx, existing in enumerate(filtered_files):
                    if os.path.getsize(existing) == size:
                        filtered_files[idx] = f
                        break
            continue
        seen_sizes.add(size)
        filtered_files.append(f)
    return sorted(filtered_files)

def get_harmonics(p):
    # Returns the set of pitch classes representing standard harmonics of pitch class p
    # 1st/2nd/4th/8th: p
    # 3rd/6th: (p + 7) % 12 (fifth)
    # 5th: (p + 4) % 12 (major third)
    # 7th: (p + 10) % 12 (minor seventh)
    return {p, (p + 7) % 12, (p + 4) % 12, (p + 10) % 12}

def compute_refined_pitch_accuracy(orig_audio, note_events, sr):
    if len(orig_audio) < sr * 0.3:
        return 0.75

    chroma = librosa.feature.chroma_cqt(y=orig_audio, sr=sr, hop_length=512)
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
    else:
        top_classes_orig = set()

    if len(top_classes_orig) == 0:
        top_classes_orig = set(np.argsort(chroma_mean)[-6:])

    if not note_events:
        return 0.5

    detected_classes = set(int(ev[2]) % 12 for ev in note_events)
    if not detected_classes:
        return 0.5

    # Refined recall: any top class in the original is "matched" if it's detected OR if it's a harmonic of a detected class.
    # Why? Because harmonics of detected notes naturally appear in the original chromagram and shouldn't be penalized as "missing notes".
    harmonics_of_detected = set()
    for dc in detected_classes:
        harmonics_of_detected.update(get_harmonics(dc))

    matched_orig = top_classes_orig & (detected_classes | harmonics_of_detected)
    recall = len(matched_orig) / len(top_classes_orig)

    # Refined precision: any detected class is "correct" if it appears in the top_classes_orig (directly or via neighbor).
    # To be conservative, we still require precision to match top_classes_orig directly.
    overlap = len(detected_classes & top_classes_orig)
    precision = overlap / len(detected_classes)

    if precision + recall < 1e-6:
        return 0.5

    f1 = 2 * precision * recall / (precision + recall)
    return float(np.clip(f1, 0.0, 1.0))

def main():
    audio_files = discover_audio_files()
    print(f"Found {len(audio_files)} files.")
    for f in audio_files[:5]: # Let's test on first 5 files first
        name = os.path.basename(f)
        try:
            audio, sr = librosa.load(f, sr=16000, mono=True)
            res = analyze_audio(f)
            notes = res.get("notes", [])
            # Note format in analyze_audio output:
            # notes is list of dicts with keys 'start', 'end', 'pitch', 'velocity' or list of lists
            # Let's handle both formats
            formatted_notes = []
            for n in notes:
                if isinstance(n, dict):
                    # convert pitch name to midi
                    from inspect_piano_files import pitch_name_to_midi
                    try:
                        pitches = n['pitch'].split(',')
                        for p in pitches:
                            formatted_notes.append([n['start'], n['end'], pitch_name_to_midi(p), n.get('velocity', 0.7)])
                    except Exception:
                        pass
                else:
                    formatted_notes.append(n)
            
            old_acc = res.get("quality_scores", {}).get("pitch_accuracy", 0.0)
            new_acc = compute_refined_pitch_accuracy(audio, formatted_notes, 16000) * 100
            print(f"{name:<50} | Old: {old_acc:<6.1f}% | Refined: {new_acc:<6.1f}% | Notes: {len(notes)}")
        except Exception as e:
            print(f"{name}: error: {e}")

if __name__ == "__main__":
    main()
