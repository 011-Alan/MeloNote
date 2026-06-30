# -*- coding: utf-8 -*-
# find_optimal_params.py - Grid search to optimize Pitch Validation Engine parameters for high pitch accuracy

import sys
import os
import librosa
import numpy as np

backend_path = r"C:\ReactNative\music-app\MeloNote\backend"
if backend_path not in sys.path:
    sys.path.append(backend_path)

from evaluate import _estimate_pitch_accuracy_from_chroma
from analyze import _get_transcriber, midi_to_note_name, midi_to_hz

def run_search():
    print("Loading audio and transcribing...")
    audio, sr = librosa.load("tyler.wav", sr=16000, mono=True)
    audio_30 = audio[:16000 * 30]
    
    transcriber = _get_transcriber()
    res = transcriber.transcribe(audio_30, None)
    
    raw_events = []
    for note in res['est_note_events']:
        onset = note['onset_time']
        offset = note['offset_time']
        pitch = note['midi_note']
        vel = note['velocity'] / 127.0
        if offset - onset < 0.08:
            offset = onset + 0.08
        raw_events.append([onset, offset, pitch, vel, None])
        
    print(f"Raw events: {len(raw_events)}")
    
    # Calculate chroma features of original audio
    chroma = librosa.feature.chroma_cqt(y=audio_30, sr=16000, hop_length=512)
    chroma_mean = np.mean(chroma, axis=1)
    top_classes_orig = set(np.argsort(chroma_mean)[-6:])
    
    # We want to find w1, w2, w3, w4, w5, threshold, and alpha (velocity ratio shape)
    # that maximizes the F1 score calculated by _estimate_pitch_accuracy_from_chroma.
    # The scoring function is:
    # O_ij = max(0.0, 1.0 - alpha * (vel_i / vel_j))
    # H_ij = exp(-5 * delay) * max(0.0, 1.0 - alpha * (vel_i / vel_j))
    
    best_f1 = 0.0
    best_params = {}
    
    # Grid search ranges
    w1_vals = [0.3, 0.4, 0.5, 0.6]
    w2_vals = [0.1, 0.2, 0.3]
    w3_vals = [0.05, 0.1, 0.15]
    w4_vals = [0.3, 0.4, 0.5, 0.6]
    w5_vals = [0.2, 0.3, 0.4, 0.5]
    threshold_vals = [0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45]
    alpha_vals = [0.0, 0.3, 0.5, 0.8, 1.0] # alpha=0.0 means velocity ratio is ignored (strict interval matching)
    
    # Precompute features to speed up grid search
    events = sorted([list(e) for e in raw_events], key=lambda e: e[0])
    clusters = []
    for ev in events:
        if not clusters or (ev[0] - clusters[-1][0][0]) > 0.08:
            clusters.append([ev])
        else:
            clusters[-1].append(ev)
            
    highest_in_cluster = set()
    for cluster in clusters:
        if cluster:
            highest_note = max(cluster, key=lambda e: e[2])
            highest_in_cluster.add(tuple(highest_note[:4]))
            
    harmonic_steps = {12, 19, 24, 28, 31, 36, 40}
    octave_steps = {12, 24, 36}
    
    # Precalculate for each note the candidate octave/harmonic lists
    note_candidates = []
    for i, ev in enumerate(events):
        onset_i, offset_i, pitch_i, vel_i = ev[0], ev[1], ev[2], ev[3]
        harmonics = []
        octaves = []
        
        for j, other in enumerate(events):
            if i == j:
                continue
            onset_j, offset_j, pitch_j, vel_j = other[0], other[1], other[2], other[3]
            
            # Harmonic check
            if (pitch_i > pitch_j) and (-0.05 <= onset_i - onset_j <= 0.15) and (onset_i < offset_j):
                interval = pitch_i - pitch_j
                if interval in harmonic_steps:
                    delay = max(0.0, onset_i - onset_j)
                    decay = np.exp(-5.0 * delay)
                    harmonics.append((vel_j, decay))
                    
            # Octave check
            if abs(onset_i - onset_j) <= 0.15:
                interval = abs(pitch_i - pitch_j)
                if interval in octave_steps:
                    octaves.append((vel_j, 1.0))
                    
        # Melodic continuity
        prev_neighbors = [other for other in events if other != ev and (0.0 < onset_i - other[0] <= 2.0) and abs(other[2] - pitch_i) != 12]
        next_neighbors = [other for other in events if other != ev and (0.0 < other[0] - onset_i <= 2.0) and abs(other[2] - pitch_i) != 12]
        
        leap_prev = min([abs(n[2] - pitch_i) for n in prev_neighbors]) if prev_neighbors else 6.0
        leap_next = min([abs(n[2] - pitch_i) for n in next_neighbors]) if next_neighbors else 6.0
        min_leap = min(leap_prev, leap_next)
        
        if not prev_neighbors and not next_neighbors:
            melodic_continuity = 0.0
        else:
            melodic_continuity = max(0.0, 1.0 - (min_leap / 6.0))
            
        # Onset evidence
        cluster_notes = [other for other in events if abs(other[0] - onset_i) <= 0.08]
        min_onset_in_cluster = min(n[0] for n in cluster_notes) if cluster_notes else onset_i
        if abs(onset_i - min_onset_in_cluster) < 0.02:
            onset_evidence = 1.0
        else:
            onset_evidence = 0.5
            
        is_melody = tuple(ev[:4]) in highest_in_cluster
        
        note_candidates.append({
            'ev': ev,
            'vel': vel_i,
            'pitch': pitch_i,
            'harmonics': harmonics,
            'octaves': octaves,
            'melodic_continuity': melodic_continuity,
            'onset_evidence': onset_evidence,
            'is_melody': is_melody
        })
        
    print("Running optimization loop...")
    count = 0
    for w1 in w1_vals:
        for w2 in w2_vals:
            for w3 in w3_vals:
                for w4 in w4_vals:
                    for w5 in w5_vals:
                        for threshold in threshold_vals:
                            for alpha in alpha_vals:
                                count += 1
                                # Evaluate
                                validated_events = []
                                for nc in note_candidates:
                                    vel_i = nc['vel']
                                    pitch_i = nc['pitch']
                                    
                                    # Harmonic suspicion
                                    max_h_score = 0.0
                                    for vel_j, decay in nc['harmonics']:
                                        if vel_i < vel_j:
                                            susp = decay * max(0.0, 1.0 - alpha * (vel_i / max(vel_j, 0.001)))
                                        else:
                                            # If it's a harmonic but vel_i >= vel_j, we still assign a base suspicion
                                            susp = decay * max(0.0, 1.0 - alpha) if alpha < 1.0 else 0.0
                                        if susp > max_h_score:
                                            max_h_score = susp
                                            
                                    # Octave suspicion
                                    max_o_score = 0.0
                                    for vel_j, _ in nc['octaves']:
                                        if vel_i < vel_j:
                                            susp = max(0.0, 1.0 - alpha * (vel_i / max(vel_j, 0.001)))
                                        else:
                                            susp = max(0.0, 1.0 - alpha) if alpha < 1.0 else 0.0
                                        if susp > max_o_score:
                                            max_o_score = susp
                                            
                                    final_score = (w1 * vel_i + 
                                                   w2 * nc['melodic_continuity'] + 
                                                   w3 * nc['onset_evidence'] - 
                                                   w4 * max_h_score - 
                                                   w5 * max_o_score)
                                                   
                                    keep = True
                                    if final_score < threshold:
                                        if nc['is_melody'] and vel_i > 0.70:
                                            pass # safeguard
                                        else:
                                            keep = False
                                            
                                    if keep:
                                        validated_events.append(nc['ev'])
                                        
                                # Calculate pitch accuracy F1
                                if not validated_events:
                                    continue
                                detected_classes = set(int(ev[2]) % 12 for ev in validated_events)
                                overlap = len(detected_classes & top_classes_orig)
                                if not detected_classes:
                                    continue
                                precision = overlap / len(detected_classes)
                                recall = overlap / len(top_classes_orig)
                                if precision + recall < 1e-6:
                                    f1 = 0.5
                                else:
                                    f1 = 2 * precision * recall / (precision + recall)
                                    
                                if f1 > best_f1:
                                    best_f1 = f1
                                    best_params = {
                                        'w1': w1, 'w2': w2, 'w3': w3, 'w4': w4, 'w5': w5,
                                        'threshold': threshold, 'alpha': alpha,
                                        'notes_kept': len(validated_events),
                                        'detected_classes': len(detected_classes)
                                    }
                                    
    print("\nOptimization complete!")
    print(f"Evaluated {count} parameter combinations.")
    print("Best F1 Score:", best_f1)
    print("Best Parameters:")
    for k, v in best_params.items():
        print(f"  {k}: {v}")
        
if __name__ == "__main__":
    run_search()
