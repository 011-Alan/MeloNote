# analyze.py - Professional-Grade Piano Transcription Pipeline
# Stage 1: ByteDance Piano Transcription (CRNN, MAESTRO-trained, F1=0.9677)
# Stage 2: Octave correction + Harmonic suppression + Note merging
# Stage 3: Tempo estimation (tempogram + IOI multi-candidate voting)
# Stage 4: Time signature detection (3/4, 4/4, 6/8)
# Stage 5: Adaptive quantization with 16th-note grid
# Stage 6: Stateful voice separation (left/right hand continuity)
# Stage 7: MusicXML grand staff with ties, beams, and dotted notes

import sys
import os
import math
import numpy as np
from collections import defaultdict
import networkx as nx

# Force UTF-8 for all print/logging output (prevents Windows charmap errors)
os.environ['PYTHONIOENCODING'] = 'utf-8'
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Suppress C++ / TF logs
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

class DummyStream:
    def write(self, x): pass
    def flush(self): pass
    def close(self): pass

old_stderr = sys.stderr
sys.stderr = DummyStream()

try:
    import warnings
    warnings.filterwarnings("ignore")
    import librosa
    import torch
    from piano_transcription_inference import PianoTranscription, sample_rate as PT_SR
finally:
    sys.stderr = old_stderr

DEBUG_DISABLE_REDUCTION = True
SAFE_TRANSCRIPTION_MODE = True


# ─────────────────────────────────────────────────────────────
# MODULE-LEVEL TRANSCRIBER (loaded once, reused for all calls)
# ─────────────────────────────────────────────────────────────
_transcriber = None

def _get_transcriber():
    global _transcriber
    if _transcriber is None:
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        _transcriber = PianoTranscription(device=device)
    return _transcriber


def get_basic_pitch_notes(filepath):
    try:
        from basic_pitch.inference import predict as bp_predict
        print("[analyze] Running OpenAI Basic Pitch...")
        _, _, note_events_list = bp_predict(filepath)
        bp_notes = []
        for note in note_events_list:
            bp_notes.append([float(note[0]), float(note[1]), int(note[2]), float(note[3]), None])
        print(f"[analyze] OpenAI Basic Pitch extracted {len(bp_notes)} note events.")
        return bp_notes
    except Exception as e:
        print(f"[analyze] OpenAI Basic Pitch run failed ({e})")
        return []

def ensemble_note_events(bytedance_notes, basic_pitch_notes):
    """
    Ensembles ByteDance Piano Transcription notes and OpenAI Basic Pitch notes.
    If notes overlap significantly in time and have the same pitch, they are merged.
    Calculates weighted onset/offset and velocity based on relative confidence.
    Unique notes from Basic Pitch with high confidence are added.
    """
    if not basic_pitch_notes:
        return bytedance_notes, False
        
    combined = [list(n) for n in bytedance_notes]
    ensemble_activated = False
    
    for bp_note in basic_pitch_notes:
        bp_onset, bp_offset, bp_pitch, bp_vel = float(bp_note[0]), float(bp_note[1]), int(bp_note[2]), float(bp_note[3])
        
        match_found = False
        for bd_note in combined:
            bd_onset, bd_offset, bd_pitch, bd_vel = float(bd_note[0]), float(bd_note[1]), int(bd_note[2]), float(bd_note[3])
            
            if bd_pitch == bp_pitch:
                if abs(bd_onset - bp_onset) < 0.20 or (bd_onset <= bp_onset < bd_offset) or (bp_onset <= bd_onset < bp_offset):
                    match_found = True
                    ensemble_activated = True
                    # Weighted onset: prioritize ByteDance's precise onset timing (80/20)
                    bd_note[0] = float(0.8 * bd_onset + 0.2 * bp_onset)
                    # Weighted velocity: combine relative confidences (75/25)
                    bd_note[3] = float(0.75 * bd_vel + 0.25 * bp_vel)
                    # Take the longer duration to preserve sustained notes
                    bd_note[1] = float(max(bd_offset, bp_offset))
                    break
                    
        if not match_found:
            # Stricter confidence filter for unique additive Basic Pitch notes (avoid false positives)
            if bp_vel > 0.45:
                combined.append([bp_onset, bp_offset, bp_pitch, bp_vel, None])
                ensemble_activated = True
                
    return sorted(combined, key=lambda x: x[0]), ensemble_activated

def refine_pitches_with_f0(note_events, audio, sr, use_pitch_refinement="auto", complexity_info=None, speed_preset="accurate"):
    """
    Refines note event pitches using either Torchcrepe or pYIN F0 tracks.
    If speed_preset is 'fast', we bypass pitch tracking entirely to minimize latency.
    """
    if speed_preset == "fast":
        print("[analyze] Speed preset is 'fast'. Bypassing F0 pitch refinement.")
        return note_events, "", "Bypassed (Speed preset is 'fast')"
        
    should_refine = False
    reason = "Bypassed (not requested)"
    
    # Calculate baseline metrics
    pitch_confidence = 0.0
    if note_events:
        pitch_confidence = sum(ev[3] for ev in note_events) / len(note_events)
        
    chroma_similarity = 1.0
    if note_events:
        try:
            from evaluate import quick_chroma_score
            synth_sr = min(sr, 22050)
            max_compare_samples = synth_sr * 25
            orig_clip = audio[:max_compare_samples] if len(audio) > max_compare_samples else audio
            import librosa
            orig_resampled = librosa.resample(orig_clip, orig_sr=sr, target_sr=synth_sr) if sr != synth_sr else orig_clip
            hop = 512
            if len(orig_resampled) >= synth_sr * 0.5:
                raw_orig_chroma = librosa.feature.chroma_cqt(y=orig_resampled, sr=synth_sr, hop_length=hop, bins_per_octave=36)
                chroma_similarity = quick_chroma_score(
                    raw_orig_chroma, sr, note_events, 120.0
                )
        except Exception as e:
            print(f"[analyze] Failed to compute baseline chroma similarity: {e}")
            chroma_similarity = 0.75  # fallback
            
    if use_pitch_refinement == "true":
        should_refine = True
        reason = "Active (explicitly requested)"
    elif use_pitch_refinement == "auto":
        if pitch_confidence < 0.80:
            should_refine = True
            reason = f"Active (Low pitch confidence: {pitch_confidence:.2f} < 0.80)"
        elif chroma_similarity < 0.75:
            should_refine = True
            reason = f"Active (Low chroma similarity: {chroma_similarity:.2f} < 0.75)"
        else:
            reason = f"Bypassed (Pitch confidence {pitch_confidence:.2f} >= 0.80 and Chroma similarity {chroma_similarity:.2f} >= 0.75)"
            
    if not should_refine or not note_events:
        return note_events, "", reason
        
    print(f"[analyze] Running Pitch Refinement tracker ({reason}) with Ensemble Harmonic Voting...")
    
    f0_tc = None
    f0_py = None
    
    # Run Torchcrepe
    try:
        import torchcrepe
        import torch
        print("[analyze] Torchcrepe found. Estimating F0...")
        audio_tensor = torch.from_numpy(audio.copy()).float().unsqueeze(0)
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        
        f0_tensor = torchcrepe.predict(
            audio_tensor,
            sr,
            hop_length=512,
            fmin=50,
            fmax=2000,
            model='full',
            device=device
        )
        f0_tc = f0_tensor.squeeze().cpu().numpy()
        print(f"[analyze] Torchcrepe F0 completed successfully on {device}.")
    except Exception as tc_err:
        print(f"[analyze] Torchcrepe F0 estimation failed/unavailable: {tc_err}")
        
    # Run pYIN
    try:
        import librosa
        print("[analyze] Running pYIN F0 estimation...")
        fmin = librosa.note_to_hz('C1')
        fmax = librosa.note_to_hz('C8')
        f0_py_vals, voiced_flag, voiced_probs = librosa.pyin(
            audio,
            fmin=fmin,
            fmax=fmax,
            sr=sr,
            hop_length=512,
            fill_na=None
        )
        f0_py = f0_py_vals
        print("[analyze] pYIN F0 completed successfully.")
    except Exception as py_err:
        print(f"[analyze] pYIN F0 estimation failed/unavailable: {py_err}")

    # Refinement helper
    def apply_refinement(f0_track, f0_method):
        if f0_track is None or len(f0_track) == 0:
            return [list(ev) for ev in note_events], 0
        events = [list(ev) for ev in note_events]
        hop_length = 512
        frame_dur = hop_length / sr
        refined_count = 0
        for ev in events:
            onset, offset, pitch = ev[0], ev[1], int(ev[2])
            start_frame = int(onset / frame_dur)
            end_frame = max(start_frame + 1, int(offset / frame_dur))
            f0_slice = f0_track[start_frame:end_frame]
            valid_f0 = f0_slice[~np.isnan(f0_slice)] if f0_method == "pYIN" else f0_slice[f0_slice > 0]
            if len(valid_f0) > 2:
                median_hz = np.median(valid_f0)
                if median_hz > 0:
                    refined_midi = 12 * np.log2(median_hz / 440.0) + 69.0
                    rounded_midi = int(round(refined_midi))
                    if abs(refined_midi - pitch) <= 1.2:
                        pass
                    elif abs(rounded_midi - pitch) in [12, 24] and len(valid_f0) > (end_frame - start_frame) * 0.5:
                        ev[2] = rounded_midi
                        refined_count += 1
        return events, refined_count

    # Evaluate candidates
    from evaluate import quick_chroma_score
    synth_sr = min(sr, 22050)
    _COMPARE_WINDOW_SEC = 25.0
    max_compare_samples = int(_COMPARE_WINDOW_SEC * synth_sr)
    
    if len(audio) > max_compare_samples:
        orig_clip = audio[:max_compare_samples]
    else:
        orig_clip = audio
        
    if sr != synth_sr:
        try:
            import librosa
            orig_res = librosa.resample(orig_clip, orig_sr=sr, target_sr=synth_sr)
        except Exception:
            orig_res = orig_clip
    else:
        orig_res = orig_clip
        
    try:
        import librosa
        orig_chroma = librosa.feature.chroma_cqt(y=orig_res, sr=synth_sr, hop_length=512, bins_per_octave=36)
    except Exception:
        orig_chroma = orig_res

    # 1. Unrefined notes candidate
    notes_unrefined = [list(ev) for ev in note_events]
    score_unrefined = quick_chroma_score(orig_chroma, sr, notes_unrefined, 120.0)
    print(f"[ensemble-voting] Unrefined notes chroma similarity: {score_unrefined:.4f}")
    
    best_notes = notes_unrefined
    best_score = score_unrefined
    selected_method = ""
    selected_reason = "Bypassed (no F0 refinement improved similarity)"
    
    # 2. Torchcrepe candidate
    tc_count = 0
    if f0_tc is not None:
        notes_tc, tc_count_val = apply_refinement(f0_tc, "Torchcrepe")
        tc_count = tc_count_val
        score_tc = quick_chroma_score(orig_chroma, sr, notes_tc, 120.0)
        print(f"[ensemble-voting] Torchcrepe refined ({tc_count} changes) chroma similarity: {score_tc:.4f}")
        if score_tc > best_score:
            best_score = score_tc
            best_notes = notes_tc
            selected_method = "Torchcrepe"
            selected_reason = f"Torchcrepe refined {tc_count} notes and improved similarity to {score_tc:.4f}"
            
    # 3. pYIN candidate
    py_count = 0
    if f0_py is not None:
        notes_py, py_count_val = apply_refinement(f0_py, "pYIN")
        py_count = py_count_val
        score_py = quick_chroma_score(orig_chroma, sr, notes_py, 120.0)
        print(f"[ensemble-voting] pYIN refined ({py_count} changes) chroma similarity: {score_py:.4f}")
        if score_py > best_score:
            best_score = score_py
            best_notes = notes_py
            selected_method = "pYIN"
            selected_reason = f"pYIN refined {py_count} notes and improved similarity to {score_py:.4f}"
            
    if selected_method == "":
        if f0_tc is not None or f0_py is not None:
            selected_reason = f"Bypassed (unrefined similarity {score_unrefined:.4f} was highest)"
            print(f"[ensemble-voting] Keeping unrefined notes (highest similarity: {score_unrefined:.4f})")
        else:
            selected_reason = "Bypassed (F0 pitch estimation failed)"
            
    print(f"[analyze] Pitch Refinement complete. Selected method: {selected_method or 'None'} (Chroma similarity: {best_score:.4f}).")
    return best_notes, selected_method, selected_reason

# ─────────────────────────────────────────────────────────────
# MIDI HELPERS
# ─────────────────────────────────────────────────────────────
def midi_to_hz(m):
    return 440.0 * (2.0 ** ((m - 69) / 12.0))

def midi_to_note_name(midi_number, use_flats=False):
    NOTES_SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    NOTES_FLATS  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
    note_name = NOTES_FLATS[midi_number % 12] if use_flats else NOTES_SHARPS[midi_number % 12]
    octave = (midi_number // 12) - 1
    return f"{note_name}{octave}"


# ─────────────────────────────────────────────────────────────
# PITCH VALIDATION ENGINE
# ─────────────────────────────────────────────────────────────
def run_pitch_validation_engine(note_events, verbose=True):
    if not note_events:
        return []
        
    events = [list(e) for e in note_events]
    events = sorted(events, key=lambda e: e[0]) # Sort by start time
    
    # 1. Group notes into simultaneous onset clusters (tolerance = 0.08s)
    clusters = []
    for ev in events:
        if not clusters or (ev[0] - clusters[-1][0][0]) > 0.08:
            clusters.append([ev])
        else:
            clusters[-1].append(ev)
            
    # Map note to its cluster and check if it's the highest pitch (melody candidate)
    highest_in_cluster = set()
    for cluster in clusters:
        if cluster:
            highest_note = max(cluster, key=lambda e: e[2])
            highest_in_cluster.add(tuple(highest_note[:4])) # tuple of (onset, offset, pitch, velocity)
            
    # Harmonic ratios in semitones:
    # 2x: +12, 3x: +19, 4x: +24, 5x: +28, 6x: +31, 8x: +36, 10x: +40
    harmonic_steps = {12, 19, 24, 28, 31, 36, 40}
    octave_steps = {12, 24, 36}
    
    validated_events = []
    report = []
    
    for i, ev in enumerate(events):
        onset_i, offset_i, pitch_i, vel_i = ev[0], ev[1], ev[2], ev[3]
        
        # 1. Confidence Score
        confidence = vel_i
        
        # 2. Harmonic Suspicion Score
        max_h_score = 0.0
        h_reason = ""
        
        # 3. Octave Ghost Score
        max_o_score = 0.0
        o_reason = ""
        
        for j, other in enumerate(events):
            if i == j:
                continue
            onset_j, offset_j, pitch_j, vel_j = other[0], other[1], other[2], other[3]
            
            # For Harmonic check: other must be a fundamental (lower pitch)
            # Other starts at similar time or earlier: -0.05 <= onset_i - onset_j <= 0.15s
            # Other overlaps with current note: onset_i < offset_j
            # For Harmonic check: other must be a fundamental (lower pitch)
            # Other starts at similar time or earlier: -0.05 <= onset_i - onset_j <= 0.15s
            # Other overlaps with current note: onset_i < offset_j
            if (pitch_i > pitch_j) and (-0.05 <= onset_i - onset_j <= 0.15) and (onset_i < offset_j):
                interval = pitch_i - pitch_j
                if interval in harmonic_steps:
                    delay = max(0.0, onset_i - onset_j)
                    decay = math.exp(-5.0 * delay)
                    if vel_i < vel_j:
                        susp = decay * max(0.0, 1.0 - 0.3 * (vel_i / max(vel_j, 0.001)))
                    else:
                        # Even if duplicate is louder/same, assign a base suspicion for exact interval match
                        susp = decay * 0.7
                    if susp > max_h_score:
                        max_h_score = susp
                        h_reason = f"harm. of {midi_to_note_name(pitch_j)}({pitch_j}) ratio={interval}st"
                        
            # For Octave check: other is octave duplicate (could be higher or lower)
            # Both onsets within 0.15s
            if abs(onset_i - onset_j) <= 0.15:
                interval = abs(pitch_i - pitch_j)
                if interval in octave_steps:
                    if vel_i < vel_j:
                        susp = max(0.0, 1.0 - 0.3 * (vel_i / max(vel_j, 0.001)))
                    else:
                        susp = 0.7
                    if susp > max_o_score:
                        max_o_score = susp
                        o_reason = f"oct. ghost of {midi_to_note_name(pitch_j)}({pitch_j})"
                            
        # 4. Melodic Continuity Score
        # Find neighbors in local window of 2.0 seconds around onset_i
        prev_neighbors = [other for other in events if other != ev and (0.0 < onset_i - other[0] <= 2.0) and abs(other[2] - pitch_i) != 12]
        next_neighbors = [other for other in events if other != ev and (0.0 < other[0] - onset_i <= 2.0) and abs(other[2] - pitch_i) != 12]
        
        leap_prev = min([abs(n[2] - pitch_i) for n in prev_neighbors]) if prev_neighbors else 6.0
        leap_next = min([abs(n[2] - pitch_i) for n in next_neighbors]) if next_neighbors else 6.0
        min_leap = min(leap_prev, leap_next)
        
        if not prev_neighbors and not next_neighbors:
            melodic_continuity = 0.0
        else:
            melodic_continuity = max(0.0, 1.0 - (min_leap / 6.0))
            
        # 5. Onset Evidence
        cluster_notes = [other for other in events if abs(other[0] - onset_i) <= 0.08]
        min_onset_in_cluster = min(n[0] for n in cluster_notes) if cluster_notes else onset_i
        if abs(onset_i - min_onset_in_cluster) < 0.02:
            onset_evidence = 1.0
        else:
            onset_evidence = 0.5
            
        # Weighted Final Score calculation
        final_score = (0.4 * confidence + 
                       0.1 * melodic_continuity + 
                       0.05 * onset_evidence - 
                       0.3 * max_h_score - 
                       0.2 * max_o_score)
                       
        is_melody = tuple(ev[:4]) in highest_in_cluster
        keep = True
        reason = "Valid note"
        
        if final_score < 0.15:
            if is_melody and confidence > 0.70:
                reason = f"Melody safeguard (score={final_score:.2f} but high conf melody)"
            else:
                keep = False
                if max_h_score > max_o_score:
                    reason = f"Harmonic ghost suspicion ({h_reason}, score={final_score:.2f})"
                else:
                    reason = f"Octave ghost suspicion ({o_reason}, score={final_score:.2f})"
                    
        if keep:
            # Reconstruct list with instrument reference if available, else None
            inst_ref = ev[4] if len(ev) > 4 else None
            validated_events.append([onset_i, offset_i, pitch_i, vel_i, inst_ref])
            status_str = "KEEP"
        else:
            status_str = "DISCARD"
            
        report.append({
            "pitch": midi_to_note_name(pitch_i) + f"({pitch_i})",
            "confidence": f"{confidence:.2f}",
            "harmonic_score": f"{max_h_score:.2f}",
            "octave_score": f"{max_o_score:.2f}",
            "status": status_str,
            "reason": reason
        })
        
    if verbose:
        print("\n" + "="*80)
        print("        PITCH VALIDATION REPORT")
        print("="*80)
        print(f"{'Pitch':<12} | {'Conf':<6} | {'Harm':<6} | {'Oct':<6} | {'Status':<8} | {'Reason':<40}")
        print("-"*80)
        for r in report[:50]:
            print(f"{r['pitch']:<12} | {r['confidence']:<6} | {r['harmonic_score']:<6} | {r['octave_score']:<6} | {r['status']:<8} | {r['reason']:<40}")
        if len(report) > 50:
            print(f"... and {len(report) - 50} more notes.")
        print("="*80 + "\n")
    
    return validated_events


# ─────────────────────────────────────────────────────────────
# OCTAVE CORRECTION POST-PROCESSING
# ─────────────────────────────────────────────────────────────
def correct_octaves(note_events, cluster_window=0.08, verbose=True):
    return run_pitch_validation_engine(note_events, verbose=verbose)



# ─────────────────────────────────────────────────────────────
# HARMONIC OVERTONE SUPPRESSION
# ─────────────────────────────────────────────────────────────
def suppress_harmonics(note_events, onset_tolerance=0.08, verbose=True):
    """
    Route to the Pitch Validation Engine to validate pitches using the weighted scoring decision system.
    """
    return run_pitch_validation_engine(note_events, verbose=verbose)


# ─────────────────────────────────────────────────────────────
# NOTE MERGING (heal fragmented sustained notes)
# ─────────────────────────────────────────────────────────────
def merge_fragmented_notes(note_events, gap_threshold=0.35):
    """
    Merge notes of the same pitch that are within gap_threshold seconds of each other.
    Velocity-aware: always merge very small gaps (physical repetition limit < 0.18s)
    to heal frame dropouts, and merge larger gaps up to gap_threshold if the second
    note's velocity ratio < 0.75 (which preserves real louder re-strikes).
    """
    if not note_events:
        return note_events

    by_pitch = {}
    for note in note_events:
        start_time, end_time, pitch_midi = note[0], note[1], note[2]
        amp = note[3] if len(note) > 3 else 1.0
        pb  = note[4] if len(note) > 4 else None
        by_pitch.setdefault(pitch_midi, []).append([start_time, end_time, pitch_midi, amp, pb])

    merged_events = []
    for pitch, events in by_pitch.items():
        events.sort(key=lambda x: x[0])
        merged_pitch_events = []
        for ev in events:
            if not merged_pitch_events:
                merged_pitch_events.append(list(ev))
            else:
                last_ev = merged_pitch_events[-1]
                gap = ev[0] - last_ev[1]
                vel_ratio = ev[3] / max(last_ev[3], 0.001)
                # Merge if: very small gap (unconditional) OR (gap < threshold AND vel_ratio < 0.75)
                if gap < 0.18 or (gap < gap_threshold and vel_ratio < 0.75):
                    last_ev[1] = max(last_ev[1], ev[1])
                    last_ev[3] = max(last_ev[3], ev[3])
                else:
                    merged_pitch_events.append(list(ev))
        merged_events.extend(merged_pitch_events)

    return merged_events

def apply_advanced_post_processing(note_events, audio, sr, tempo, key_sig, activated_modules, activation_reasons):
    if not note_events:
        return note_events

    if SAFE_TRANSCRIPTION_MODE:
        print("[post-process] SAFE_TRANSCRIPTION_MODE active: Bypassing advanced post-processing merging.")
        return sorted([list(e) for e in note_events], key=lambda x: x[0])

    import numpy as np
    import copy
    import math

    # 1. Onset Smoothing & Same-Pitch Merging
    # A. Same-pitch merging (onset diff <= 60ms or overlap)
    events = [list(e) for e in note_events]
    events.sort(key=lambda x: (x[2], x[0])) # Sort by pitch, then onset
    
    same_pitch_merged = []
    for ev in events:
        if not same_pitch_merged:
            same_pitch_merged.append(ev)
        else:
            last = same_pitch_merged[-1]
            if last[2] == ev[2] and (ev[0] - last[0] <= 0.060 or ev[0] - last[1] <= 0.060):
                # Merge them: extend duration
                last[1] = max(last[1], ev[1])
                last[3] = max(last[3], ev[3])
            else:
                same_pitch_merged.append(ev)
                
    # B. Onset Smoothing for different pitches (chord alignment)
    # If onsets of different notes are within 50ms, align them to their average onset
    same_pitch_merged.sort(key=lambda x: x[0])
    aligned_events = []
    
    i = 0
    n = len(same_pitch_merged)
    while i < n:
        cluster = [same_pitch_merged[i]]
        j = i + 1
        while j < n and same_pitch_merged[j][0] - same_pitch_merged[i][0] <= 0.050:
            cluster.append(same_pitch_merged[j])
            j += 1
            
        if len(cluster) > 1:
            avg_onset = sum(x[0] for x in cluster) / len(cluster)
            for x in cluster:
                # Keep duration same, just shift onset
                dur = x[1] - x[0]
                x[0] = avg_onset
                x[1] = avg_onset + dur
                
        aligned_events.extend(cluster)
        i = j

    aligned_events.sort(key=lambda x: x[0])

    # 2. Minimum Duration Threshold (dur < 120ms and next note same pitch starts within 250ms)
    dur_threshold_merged = []
    aligned_events.sort(key=lambda x: (x[2], x[0])) # Sort by pitch, then onset
    
    for ev in aligned_events:
        if not dur_threshold_merged:
            dur_threshold_merged.append(ev)
        else:
            last = dur_threshold_merged[-1]
            if last[2] == ev[2] and (last[1] - last[0] < 0.120) and (ev[0] - last[1] <= 0.250):
                # Merge into a single sustained note
                last[1] = ev[1]
                last[3] = max(last[3], ev[3])
            else:
                dur_threshold_merged.append(ev)

    dur_threshold_merged.sort(key=lambda x: x[0])

    # 3. Ensemble Voting & 4. Confidence-Weighted Correction
    # Compare outputs from ByteDance, Basic Pitch, and F0 Tracker (Torchcrepe/pYIN)
    # Since ByteDance CRNN is our master model, we check if Basic Pitch split a note that ByteDance and F0 consider single.
    # Also apply Confidence-Weighted snaps.
    beat_dur = 60.0 / max(tempo, 40.0)
    
    voted_events = []
    # Sort same-pitch notes to detect split notes
    dur_threshold_merged.sort(key=lambda x: (x[2], x[0]))
    
    i = 0
    n = len(dur_threshold_merged)
    while i < n:
        ev = dur_threshold_merged[i]
        # Check if there is a split (next note of same pitch starts very close)
        if i < n - 1:
            next_ev = dur_threshold_merged[i + 1]
            if next_ev[2] == ev[2] and (next_ev[0] - ev[1] <= 0.150):
                # We have a candidate split! Check if both combine to ~quaver (0.5 beats = 0.5 * beat_dur)
                total_dur = next_ev[1] - ev[0]
                if abs(total_dur - 0.5 * beat_dur) < 0.150:
                    # Let's check Torchcrepe/Pyin or ByteDance consensus
                    f0_active = activated_modules.get("torchcrepe", False) or activated_modules.get("pyin", False)
                    # Majority vote: if ByteDance note is high confidence, or if F0 tracker is active, we merge them
                    if f0_active or ev[3] > 0.65:
                        # Merge them back to a single note!
                        ev[1] = next_ev[1]
                        ev[3] = max(ev[3], next_ev[3])
                        i += 2
                        voted_events.append(ev)
                        continue
                        
        voted_events.append(ev)
        i += 1

    # Confidence-Weighted snap to longer values:
    for ev in voted_events:
        onset, offset, pitch, vel = ev[0], ev[1], ev[2], ev[3]
        dur_beats = (offset - onset) / beat_dur
        # If confidence (velocity) > 0.70 and duration is ambiguous:
        if vel > 0.70:
            # Snap to nearest standard durations: 0.5, 1.0, 1.5, 2.0 beats
            for std in [0.5, 1.0, 1.5, 2.0]:
                if abs(dur_beats - std) < 0.12: # ambiguous range
                    # Prefer the longer value
                    ev[1] = onset + std * beat_dur
                    break

    voted_events.sort(key=lambda x: x[0])

    # 5. Musical Grammar Layer
    # Avoid excessive tied sixteenths by snapping note ends to beat boundaries if they end very close to a beat boundary (within 80ms)
    for ev in voted_events:
        onset, offset = ev[0], ev[1]
        # Find nearest beat boundary relative to onset
        onset_beat = onset / beat_dur
        offset_beat = offset / beat_dur
        
        nearest_int_offset = round(offset_beat)
        time_to_boundary = abs(offset - nearest_int_offset * beat_dur)
        if time_to_boundary <= 0.080:
            # Snap offset to the beat boundary
            ev[1] = nearest_int_offset * beat_dur

    if SAFE_TRANSCRIPTION_MODE:
        print("[post-process] SAFE_TRANSCRIPTION_MODE active: Bypassing Self-Optimizing Harmonic Feedback Loop.")
        return voted_events

    # 6. Self-Optimizing Iterative Feedback Loop
    print("[post-process] Initializing Self-Optimizing Harmonic Feedback Loop...")
    
    synth_sr = min(sr, 22050)
    _COMPARE_WINDOW_SEC = 25.0
    max_compare_samples = int(_COMPARE_WINDOW_SEC * synth_sr)
    
    # Clip and resample original audio
    if len(audio) > max_compare_samples:
        orig_clip = audio[:max_compare_samples]
    else:
        orig_clip = audio
        
    if sr != synth_sr:
        try:
            import librosa
            orig_resampled = librosa.resample(orig_clip, orig_sr=sr, target_sr=synth_sr)
        except Exception:
            orig_resampled = orig_clip
    else:
        orig_resampled = orig_clip
        
    try:
        import librosa
        orig_chroma = librosa.feature.chroma_cqt(y=orig_resampled, sr=synth_sr, hop_length=512, bins_per_octave=36)
        print(f"[optimizer] Precomputed original chromagram shape: {orig_chroma.shape}")
    except Exception as e:
        print(f"[optimizer] Precomputing chroma failed ({e}), falling back to waveform.")
        orig_chroma = orig_resampled
        
    # Helper to evaluate note events chroma similarity
    def evaluate_notes_chroma(notes_list):
        if not notes_list:
            return 0.0
        valid_notes = [n for n in notes_list if n is not None]
        if not valid_notes:
            return 0.0
        try:
            from evaluate import synthesize_from_notes, compute_chroma_similarity
            # Limit notes to comparison window to avoid unnecessary computation
            clipped = [ev for ev in valid_notes if ev[0] < _COMPARE_WINDOW_SEC]
            if not clipped:
                clipped = valid_notes
            synth_audio = synthesize_from_notes(clipped, tempo, sr=synth_sr, grid_resolution=0.25)
            if len(synth_audio) > max_compare_samples:
                synth_audio = synth_audio[:max_compare_samples]
            return compute_chroma_similarity(orig_chroma, synth_audio, synth_sr)
        except Exception as e:
            print(f"[optimizer] Evaluation failed ({e})")
            return 0.0

    # Define scale maps (pitch classes) for major and minor keys
    major_scales = {
        "C": [0, 2, 4, 5, 7, 9, 11], "G": [7, 9, 11, 0, 2, 4, 6], "D": [2, 4, 6, 7, 9, 11, 1],
        "A": [9, 11, 1, 2, 4, 6, 8], "E": [4, 6, 8, 9, 11, 1, 3], "B": [11, 1, 3, 4, 6, 8, 10],
        "F#": [6, 8, 10, 11, 1, 3, 5], "C#": [1, 3, 5, 6, 8, 10, 0], "F": [5, 9, 0, 2, 4, 7, 11],
        "Bb": [10, 0, 2, 3, 5, 7, 9], "Eb": [3, 5, 7, 8, 10, 0, 2], "Ab": [8, 10, 0, 1, 3, 5, 7],
        "Db": [1, 3, 5, 6, 8, 10, 0], "Gb": [6, 8, 10, 11, 1, 3, 5], "Cb": [11, 1, 3, 4, 6, 8, 10]
    }
    major_scales["F"] = [5, 7, 9, 10, 0, 2, 4]
    
    minor_scales = {
        "a": [9, 11, 0, 2, 4, 5, 7], "e": [4, 6, 7, 9, 11, 0, 2], "b": [11, 1, 2, 4, 6, 7, 9],
        "f#": [6, 8, 9, 11, 1, 2, 4], "c#": [1, 3, 4, 6, 8, 9, 11], "g#": [8, 10, 11, 1, 3, 4, 6],
        "d#": [3, 5, 6, 8, 10, 11, 1], "a#": [10, 0, 1, 3, 5, 6, 8], "d": [2, 4, 5, 7, 9, 10, 0],
        "g": [7, 9, 10, 0, 2, 3, 5], "c": [0, 2, 3, 5, 7, 8, 10], "f": [5, 7, 8, 10, 0, 1, 3],
        "bb": [10, 0, 1, 3, 5, 6, 8], "eb": [3, 5, 6, 8, 10, 11, 1], "ab": [8, 10, 11, 1, 3, 4, 6]
    }
    
    # Tonic triad mapping for primary scale snap targets
    tonic_triads = {
        "C": [0, 4, 7], "G": [7, 11, 2], "D": [2, 6, 9], "A": [9, 1, 4], "E": [4, 8, 11], "B": [11, 3, 6],
        "F#": [6, 10, 1], "C#": [1, 5, 8], "F": [5, 9, 0], "Bb": [10, 2, 5], "Eb": [3, 7, 10], "Ab": [8, 0, 3],
        "Db": [1, 5, 8], "Gb": [6, 10, 1], "Cb": [11, 3, 6],
        "a": [9, 0, 4], "e": [4, 7, 11], "b": [11, 2, 6], "f#": [6, 9, 1], "c#": [1, 4, 8], "g#": [8, 11, 3],
        "d#": [3, 6, 10], "a#": [10, 1, 5], "d": [2, 5, 9], "g": [7, 10, 2], "c": [0, 3, 7], "f": [5, 8, 0],
        "bb": [10, 1, 5], "eb": [3, 6, 10], "ab": [8, 11, 3]
    }
    
    active_scale = major_scales.get(key_sig, minor_scales.get(key_sig, [0, 2, 4, 5, 7, 9, 11]))
    active_triad = tonic_triads.get(key_sig, [0, 4, 7])
    
    def get_nearest_pitch(pitch, target_pcs):
        pitch_class = pitch % 12
        distances = []
        for tone in target_pcs:
            dist = abs(pitch_class - tone)
            if dist > 6:
                dist = 12 - dist
            distances.append((dist, tone))
        distances.sort()
        best_tone = distances[0][1]
        diff = best_tone - pitch_class
        if diff > 6:
            diff -= 12
        elif diff < -6:
            diff += 12
        return max(21, min(108, pitch + diff))

    # Initial state
    current_notes = [list(ev) for ev in voted_events]
    best_score = evaluate_notes_chroma(current_notes)
    print(f"[optimizer] Initial chroma similarity: {best_score:.4f}")
    
    max_passes = 3
    for pass_num in range(1, max_passes + 1):
        if best_score >= 0.90:
            print(f"[optimizer] Target similarity achieved ({best_score:.4f} >= 0.90). Terminating early.")
            break
            
        # Find all candidates where confidence < 0.75 or note is out of scale
        candidates = []
        for idx, ev in enumerate(current_notes):
            if ev is None:
                continue
            confidence = ev[3]
            pitch_class = ev[2] % 12
            # Flag if confidence < 0.75, or note is out of scale, or octave ghost candidate
            is_octave_ghost_candidate = False
            for j, other in enumerate(current_notes):
                if idx != j and other is not None and abs(other[0] - ev[0]) <= 0.080 and abs(other[2] - ev[2]) in [12, 24]:
                    is_octave_ghost_candidate = True
                    break
                    
            if confidence < 0.75 or pitch_class not in active_scale or is_octave_ghost_candidate:
                candidates.append(idx)
                
        # Sort candidates: lowest confidence first, so we optimize the most suspicious notes first
        candidates.sort(key=lambda idx: current_notes[idx][3] if current_notes[idx] is not None else 1.0)
        
        changed_count = 0
        for idx in candidates:
            orig_ev = current_notes[idx]
            if orig_ev is None:
                continue
                
            pitch = orig_ev[2]
            vel = orig_ev[3]
            onset = orig_ev[0]
            pitch_class = pitch % 12
            
            # Generate options
            options = []
            
            # 1. Keep (Baseline)
            options.append(("Keep", orig_ev, best_score))
            
            # 2. Discard
            current_notes[idx] = None
            score_discard = evaluate_notes_chroma(current_notes)
            options.append(("Discard", None, score_discard))
            current_notes[idx] = orig_ev  # restore
            
            # Try snapping/shifting only if pitch class is not in the active scale
            if pitch_class not in active_scale:
                # 3. Snap to Scale
                scale_pitch = get_nearest_pitch(pitch, active_scale)
                if scale_pitch != pitch:
                    snap_ev = list(orig_ev)
                    snap_ev[2] = scale_pitch
                    current_notes[idx] = snap_ev
                    score_scale = evaluate_notes_chroma(current_notes)
                    options.append(("Snap to Scale", snap_ev, score_scale))
                    current_notes[idx] = orig_ev  # restore
                    
                # 4. Snap to Triad
                triad_pitch = get_nearest_pitch(pitch, active_triad)
                if triad_pitch != pitch and triad_pitch != scale_pitch:
                    triad_ev = list(orig_ev)
                    triad_ev[2] = triad_pitch
                    current_notes[idx] = triad_ev
                    score_triad = evaluate_notes_chroma(current_notes)
                    options.append(("Snap to Triad", triad_ev, score_triad))
                    current_notes[idx] = orig_ev  # restore
                    
                # 5. Shift -1 semitone (accidental correction)
                s_minus_ev = list(orig_ev)
                s_minus_ev[2] = max(21, min(108, pitch - 1))
                if s_minus_ev[2] != pitch and s_minus_ev[2] != scale_pitch and s_minus_ev[2] != triad_pitch:
                    current_notes[idx] = s_minus_ev
                    score_minus_1 = evaluate_notes_chroma(current_notes)
                    options.append(("Shift -1st", s_minus_ev, score_minus_1))
                    current_notes[idx] = orig_ev  # restore
                    
                # 6. Shift +1 semitone
                s_plus_ev = list(orig_ev)
                s_plus_ev[2] = max(21, min(108, pitch + 1))
                if s_plus_ev[2] != pitch and s_plus_ev[2] != scale_pitch and s_plus_ev[2] != triad_pitch:
                    current_notes[idx] = s_plus_ev
                    score_plus_1 = evaluate_notes_chroma(current_notes)
                    options.append(("Shift +1st", s_plus_ev, score_plus_1))
                    current_notes[idx] = orig_ev  # restore
            
            # Try octave shifts only if it is an octave ghost candidate
            is_octave_ghost_candidate = False
            for j, other in enumerate(current_notes):
                if idx != j and other is not None and abs(other[0] - onset) <= 0.080 and abs(other[2] - pitch) in [12, 24]:
                    is_octave_ghost_candidate = True
                    break
                    
            if is_octave_ghost_candidate:
                # 7. Shift -12 semitones
                oct_down_ev = list(orig_ev)
                oct_down_ev[2] = max(21, min(108, pitch - 12))
                if oct_down_ev[2] != pitch:
                    current_notes[idx] = oct_down_ev
                    score_oct_down = evaluate_notes_chroma(current_notes)
                    options.append(("Shift -12st", oct_down_ev, score_oct_down))
                    current_notes[idx] = orig_ev  # restore
                    
                # 8. Shift +12 semitones
                oct_up_ev = list(orig_ev)
                oct_up_ev[2] = max(21, min(108, pitch + 12))
                if oct_up_ev[2] != pitch:
                    current_notes[idx] = oct_up_ev
                    score_oct_up = evaluate_notes_chroma(current_notes)
                    options.append(("Shift +12st", oct_up_ev, score_oct_up))
                    current_notes[idx] = orig_ev  # restore
                
            # Pick the best option
            options.sort(key=lambda x: x[2], reverse=True)
            best_opt_name, best_opt_ev, best_opt_score = options[0]
            
            # Commit changes only if it strictly improves or matches with a simplified state
            is_improvement = best_opt_score > best_score + 1e-5
            is_redundant_discard = (best_opt_name == "Discard" and abs(best_opt_score - best_score) <= 1e-4 and vel < 0.65)
            
            if is_improvement or is_redundant_discard:
                prev_score = best_score
                best_score = best_opt_score
                current_notes[idx] = best_opt_ev
                changed_count += 1
                print(f"[optimizer] Pass {pass_num}, note {midi_to_note_name(pitch)}({pitch}) at {onset:.2f}s "
                      f"(conf={vel:.2f}) -> {best_opt_name} -> similarity {prev_score:.4f} -> {best_score:.4f}")
                      
        print(f"[optimizer] Pass {pass_num} completed. Changed {changed_count} notes. Current similarity: {best_score:.4f}")
        if changed_count == 0:
            print("[optimizer] Convergence reached (no notes changed). Stopping.")
            break
            
    # Return the optimized events
    optimized_events = [ev for ev in current_notes if ev is not None]
    optimized_events.sort(key=lambda x: x[0])
    return optimized_events


def extend_notes_by_pedal(note_events, pedal_events):
    """
    Extend note offset times based on sustain pedal events.
    If a note starts before a pedal release (offset_time of pedal) and its physical
    release (offset_time of note) is during the pedal press window, the string continues
    to ring out until the pedal is released.
    """
    if not note_events or not pedal_events:
        return note_events

    extended_events = []
    for ev in note_events:
        onset, offset, pitch, vel, pb = ev
        new_offset = offset
        for pedal in pedal_events:
            p_onset = pedal['onset_time']
            p_offset = pedal['offset_time']
            # If note was struck before pedal release, and physical release was during pedal press:
            if onset < p_offset and p_onset <= offset <= p_offset:
                new_offset = max(new_offset, p_offset)
        extended_events.append([onset, new_offset, pitch, vel, pb])
    return extended_events



# ─────────────────────────────────────────────────────────────
# ONSET-BASED TEMPO ESTIMATION (Multi-candidate voting)
# ─────────────────────────────────────────────────────────────
def estimate_tempo_from_onsets(note_events, audio=None, sr=None, fallback_tempo=120.0):
    """
    Estimate BPM using three independent signals and select the best consensus:
      1. IOI histogram (inter-onset interval peak)
      2. Librosa beat_track (passed in as fallback_tempo)
      3. Tempogram autocorrelation peak (if audio is provided)

    Resolution: sub-harmonic fold ensures we land on the quarter-note beat.
    """
    candidates = []

    # ── Signal 1: IOI histogram ─────────────────────────────
    if len(note_events) >= 6:
        onsets = sorted([e[0] for e in note_events])

        intervals = []
        for step in [1, 2]:
            for i in range(len(onsets) - step):
                diff = onsets[i + step] - onsets[i]
                if 0.08 < diff < 3.0:
                    intervals.append(diff)

        if intervals:
            bin_size = 0.05
            max_ioi  = max(intervals)
            n_bins   = int(max_ioi / bin_size) + 1
            hist     = np.zeros(n_bins)
            for ioi in intervals:
                bin_idx = int(ioi / bin_size)
                if 0 <= bin_idx < n_bins:
                    hist[bin_idx] += 1

            smoothed = np.convolve(hist, [0.2, 0.6, 0.2], mode='same')
            peak_bin = int(np.argmax(smoothed))
            dom_ioi = (peak_bin + 0.5) * bin_size
            ioi_bpm = 60.0 / dom_ioi if dom_ioi > 0 else fallback_tempo

            # Normalize to [50, 200]
            while ioi_bpm < 50.0: ioi_bpm *= 2.0
            while ioi_bpm > 200.0: ioi_bpm /= 2.0
            candidates.append(('ioi', ioi_bpm))

    # ── Signal 2: librosa beat_track ───────────────────────
    if fallback_tempo and 40 < fallback_tempo < 250:
        candidates.append(('librosa', float(fallback_tempo)))

    # ── Signal 3: Tempogram ─────────────────────────────────
    if audio is not None and sr is not None:
        try:
            tg = librosa.feature.tempogram(y=audio, sr=sr, hop_length=512)
            tg_mean = np.mean(tg, axis=1)
            # Convert frame index to BPM
            bpms = librosa.tempo_frequencies(len(tg_mean), sr=sr, hop_length=512)
            # Focus on musical range [50, 200]
            mask = (bpms >= 50) & (bpms <= 200)
            if mask.any():
                best_idx = np.argmax(tg_mean[mask])
                tg_bpm = float(bpms[mask][best_idx])
                candidates.append(('tempogram', tg_bpm))
        except Exception:
            pass

    if not candidates:
        return round(float(np.clip(fallback_tempo, 50.0, 200.0)))

    # ── Multi-candidate voting ─────────────────────────────
    # For each candidate, score it by how many other candidates agree within 15%
    best_bpm = candidates[0][1]
    best_votes = 0

    for name, bpm in candidates:
        votes = 0
        for other_name, other_bpm in candidates:
            if name == other_name:
                continue
            # Check agreement at 1x, 0.5x, 2x (sub/super-octave)
            for factor in [1.0, 0.5, 2.0]:
                if abs(bpm * factor - other_bpm) / max(other_bpm, 1.0) < 0.15:
                    votes += 1
                    break
        if votes > best_votes:
            best_votes = votes
            best_bpm = bpm

    # Normalize winner to [50, 200]
    while best_bpm < 50.0: best_bpm *= 2.0
    while best_bpm > 200.0: best_bpm /= 2.0

    return round(float(np.clip(best_bpm, 50.0, 200.0)))


# ─────────────────────────────────────────────────────────────
# TIME SIGNATURE DETECTION
# ─────────────────────────────────────────────────────────────
def detect_time_signature(note_events, tempo):
    """
    Detect time signature by analyzing note onset distribution relative to the beat grid.
    Supports: 4/4, 3/4, 6/8

    Strategy:
      1. Snap onsets to beat grid (quarter-note positions)
      2. Count notes landing on each beat position within a hypothetical measure
      3. Score 4/4 vs 3/4 vs 6/8 by comparing beat density patterns
    """
    if len(note_events) < 8:
        return "4/4"

    beat_dur = 60.0 / tempo
    onsets = sorted([e[0] for e in note_events])

    # Snap each onset to nearest beat position
    beat_positions = []
    for onset in onsets:
        beat_pos = onset / beat_dur
        beat_positions.append(beat_pos)

    # Count onsets at each beat position modulo 2, 3, 4, 6
    def count_beat_mod(beat_positions, mod):
        counts = np.zeros(mod)
        for bp in beat_positions:
            nearest = round(bp * 2) / 2  # snap to half-beat
            slot = int(round(nearest)) % mod
            counts[slot] += 1
        return counts

    counts_4 = count_beat_mod(beat_positions, 4)
    counts_3 = count_beat_mod(beat_positions, 3)
    counts_6 = count_beat_mod(beat_positions, 6)

    # Score: strong-beat concentration (beat 0 should have most notes)
    def concentration_score(counts):
        total = counts.sum()
        if total == 0:
            return 0.0
        # Normalized by how much beat 0 dominates
        return counts[0] / total

    score_44 = concentration_score(counts_4)
    score_34 = concentration_score(counts_3)

    # Check for 6/8: characteristic dotted-quarter pulse
    # In 6/8, beats 0 and 3 (eighth) are strong
    if len(counts_6) == 6:
        compound_score = (counts_6[0] + counts_6[3]) / max(counts_6.sum(), 1.0)
    else:
        compound_score = 0.0

    # Simple heuristic selection
    if compound_score > 0.55 and compound_score > score_44 and compound_score > score_34:
        return "6/8"
    elif score_34 > score_44 * 1.1 and counts_3[0] > counts_4[0] * 0.8:
        return "3/4"
    else:
        return "4/4"


# ─────────────────────────────────────────────────────────────
# KEY SIGNATURE ESTIMATOR
# ─────────────────────────────────────────────────────────────
def estimate_key_signature(note_events):
    """Estimate key signature using pitch class duration histogram."""
    histogram = np.zeros(12)
    for note in note_events:
        pitch_class = note[2] % 12
        duration = note[1] - note[0]
        histogram[pitch_class] += duration

    major_template = np.array([1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1], dtype=float)
    minor_template = np.array([1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0], dtype=float)

    flat_keys = ["F", "Bb", "Eb", "Ab", "Db", "Gb", "d", "g", "c", "f", "bb", "eb"]
    key_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    minor_key_names = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"]

    best_score = -1.0
    best_key = "C"
    use_flats = False

    for i in range(12):
        maj_temp = np.roll(major_template, i)
        min_temp = np.roll(minor_template, i)
        maj_score = np.dot(histogram, maj_temp)
        min_score = np.dot(histogram, min_temp)
        if maj_score > best_score:
            best_score = maj_score
            best_key = key_names[i]
            use_flats = best_key in flat_keys
        if min_score > best_score:
            best_score = min_score
            best_key = minor_key_names[i]
            use_flats = best_key in flat_keys

    return best_key, use_flats


# ─────────────────────────────────────────────────────────────
# STATEFUL VOICE SEPARATION (Left/Right Hand Continuity)
# ─────────────────────────────────────────────────────────────
def split_voices_stateful(note_events, cluster_window=0.08):
    """
    Assign each note to treble (right hand) or bass (left hand) using a
    stateful voice tracker that maintains continuity across time.

    Algorithm:
      1. Group notes into onset clusters
      2. For each cluster, use hand-span optimization to split pitches
      3. Apply continuity: prefer assigning pitches close to each hand's
         last active pitch to avoid jumps > 15 semitones
      4. Hard boundaries: right hand >= MIDI 40 (E2), left hand <= MIDI 84 (C6)

    Returns: (treble_events, bass_events) — same format as input events but split.
    """
    if not note_events:
        return [], []

    # Group into onset clusters
    events = sorted(note_events, key=lambda e: e[0])
    clusters = []
    for ev in events:
        if not clusters or (ev[0] - clusters[-1][0][0]) > cluster_window:
            clusters.append([ev])
        else:
            clusters[-1].append(ev)

    treble_events = []
    bass_events   = []

    # State: last assigned pitch for each hand
    rh_cursor = 64   # E4 - typical right-hand starting position
    lh_cursor = 48   # C3 - typical left-hand starting position

    for cluster in clusters:
        pitches = sorted(set(ev[2] for ev in cluster))

        if len(pitches) == 1:
            p = pitches[0]
            # Assign to whichever hand is closer, with bias
            rh_dist = abs(p - rh_cursor)
            lh_dist = abs(p - lh_cursor)
            # Bias: notes above MIDI 60 prefer right hand
            if p >= 60:
                rh_dist *= 0.7
            else:
                lh_dist *= 0.7
            if rh_dist <= lh_dist:
                for ev in cluster:
                    if ev[2] == p:
                        treble_events.append(ev)
                rh_cursor = p
            else:
                for ev in cluster:
                    if ev[2] == p:
                        bass_events.append(ev)
                lh_cursor = p
            continue

        # Multiple pitches: find best split minimizing hand span + continuity cost
        best_split = None
        best_cost  = float('inf')

        for i in range(1, len(pitches)):
            lh_pitches = pitches[:i]
            rh_pitches = pitches[i:]

            lh_span = lh_pitches[-1] - lh_pitches[0]
            rh_span = rh_pitches[-1] - rh_pitches[0]

            # Span penalty: >17 semitones is very hard to play
            span_penalty = 0
            if lh_span > 17: span_penalty += (lh_span - 17) * 5
            if rh_span > 17: span_penalty += (rh_span - 17) * 5

            # Continuity cost: jump from last cursor
            lh_jump = abs(lh_pitches[0] - lh_cursor)
            rh_jump = abs(rh_pitches[-1] - rh_cursor)

            # Boundary penalty: rh should be >= 40 (E2), lh should be <= 84 (C6)
            boundary_penalty = 0
            if rh_pitches[0] < 40: boundary_penalty += 20
            if lh_pitches[-1] > 84: boundary_penalty += 20

            cost = lh_span + rh_span + lh_jump * 0.5 + rh_jump * 0.5 + span_penalty + boundary_penalty
            if cost < best_cost:
                best_cost = cost
                best_split = i

        if best_split is None:
            best_split = 1

        lh_set = set(pitches[:best_split])
        rh_set = set(pitches[best_split:])

        for ev in cluster:
            if ev[2] in rh_set:
                treble_events.append(ev)
            else:
                bass_events.append(ev)

        # Update cursors to center of each hand's range in this cluster
        rh_assigned = [p for p in pitches if p in rh_set]
        lh_assigned = [p for p in pitches if p in lh_set]
        if rh_assigned:
            rh_cursor = int(np.median(rh_assigned))
        if lh_assigned:
            lh_cursor = int(np.median(lh_assigned))

    return treble_events, bass_events


# ─────────────────────────────────────────────────────────────
# BEAT / DURATION HELPERS
# ─────────────────────────────────────────────────────────────
# All supported beat durations in decreasing order
SUPPORTED_BEATS = [8.0, 6.0, 4.0, 3.0, 2.0, 1.5, 1.25, 1.0, 0.75, 0.5, 0.25]

def get_type_string(beats):
    """Map beat duration to MusicXML type string and dotted flag."""
    if beats >= 4.0:   return "whole",    False
    if beats >= 3.0:   return "half",     True    # dotted half
    if beats >= 2.0:   return "half",     False
    if beats >= 1.5:   return "quarter",  True    # dotted quarter
    if beats >= 1.25:  return "quarter",  False   # approx quarter (with tie to 16th)
    if beats >= 1.0:   return "quarter",  False
    if beats >= 0.75:  return "eighth",   True    # dotted eighth
    if beats >= 0.5:   return "eighth",   False
    if beats >= 0.375: return "16th",     True    # dotted 16th
    return "16th", False

def get_weighted_closest_beat(target_beats, allowed_beats):
    """Find closest allowed beat duration, with weights favouring longer durations."""
    weights = {
        4.0: 0.65, 3.0: 0.80, 2.0: 0.70,
        1.5: 0.80, 1.25: 0.90, 1.0: 0.75,
        0.75: 0.85, 0.5: 0.95, 0.25: 1.00
    }
    if not allowed_beats:
        return 0.5
    return min(allowed_beats, key=lambda x: abs(x - target_beats) * weights.get(x, 1.0))


# ─────────────────────────────────────────────────────────────
# CLEF-AWARE NOTE FORMATTER
# ─────────────────────────────────────────────────────────────
def format_clef_notes(sorted_events, is_treble, tempo, use_flats,
                      event_id_to_flat_index, capacity_beats, grid_resolution=0.25, monophonic=False):
    """
    Quantise and format a list of note events into sheet-music chords for one stave.

    is_treble:
        True  → treble stave (pitch >= 60)
        False → bass stave   (pitch < 60)
        None  → all notes (used for flat-index mapping pass)

    Uses dynamic grid_resolution (0.25 beats for 16th, 0.50 beats for 8th note grid).
    """
    # ── Use events directly (already separated statefully) ────
    clef_events = sorted_events

    if not clef_events:
        return []

    beat_duration     = 60.0 / tempo
    grid_step         = beat_duration * grid_resolution
    cluster_threshold = min(0.03, grid_step * 0.50) # chord cluster window (30ms limit for chords)

    # ── Cluster simultaneous notes into chords ───────────────
    clusters = []
    for event in clef_events:
        if not clusters or (event[0] - clusters[-1][0][0]) >= cluster_threshold:
            clusters.append([event])
        else:
            clusters[-1].append(event)

    # ── Build notes_by_start dict ────────────────────────────
    notes_by_start = {}
    for cluster in clusters:
        cluster.sort(key=lambda x: x[3], reverse=True)  # loudest first

        # Limit chord density
        if monophonic:
            if is_treble is True:
                cluster_kept = cluster[:1]
            elif is_treble is False:
                cluster_kept = cluster[:1]
            else:
                tr = [x for x in cluster if x[2] >= 60]
                bs = [x for x in cluster if x[2] < 60]
                cluster_kept = tr[:1] + bs[:1]
        else:
            if is_treble is True:
                cluster_kept = cluster[:4]
            elif is_treble is False:
                cluster_kept = cluster[:3]
            else:
                tr = [x for x in cluster if x[2] >= 60]
                bs = [x for x in cluster if x[2] < 60]
                cluster_kept = tr[:4] + bs[:3]

        if not cluster_kept:
            continue

        avg_start = sum(x[0] for x in cluster_kept) / len(cluster_kept)
        avg_end   = sum(x[1] for x in cluster_kept) / len(cluster_kept)

        # Snap to grid
        start_grid = int(round(avg_start / grid_step))
        end_grid   = int(round(avg_end   / grid_step))
        if end_grid <= start_grid:
            end_grid = start_grid + 1

        start_beat    = start_grid * grid_resolution
        duration_beats = (end_grid - start_grid) * grid_resolution

        if start_beat not in notes_by_start:
            notes_by_start[start_beat] = []
        for event in cluster_kept:
            notes_by_start[start_beat].append({
                "pitch":          event[2],
                "duration_beats": duration_beats,
                "event_id":       event[4]
            })

    sorted_beats = sorted(notes_by_start.keys())
    supported_beats = SUPPORTED_BEATS

    # ── Build chord list ─────────────────────────────────────
    chords = []
    for i, start_beat in enumerate(sorted_beats):
        group     = notes_by_start[start_beat]
        pitches   = sorted(set(n["pitch"] for n in group))
        max_dur   = max(n["duration_beats"] for n in group)
        event_ids = list(set(n["event_id"] for n in group))

        pitch_beats_list = []
        for p in pitches:
            p_dur = max(n["duration_beats"] for n in group if n["pitch"] == p)
            pitch_beats_list.append(get_weighted_closest_beat(p_dur, supported_beats))

        # Truncate against next chord
        if i < len(sorted_beats) - 1:
            available = sorted_beats[i + 1] - start_beat
            if max_dur > available:
                max_dur = available
        if max_dur < grid_resolution:
            max_dur = grid_resolution

        chords.append({
            "start_beat":    start_beat,
            "pitches":       pitches,
            "duration_beats": max_dur,
            "pitch_beats":   pitch_beats_list,
            "event_ids":     event_ids
        })

    # ── Duration decomposer ──────────────────────────────────
    def decompose_beats(beats_to_decompose):
        """Decompose duration into list of supported note values."""
        decomposed = []
        rem = beats_to_decompose
        order = [4.0, 3.0, 2.0, 1.5, 1.0, 0.75, 0.5, 0.25]
        while rem >= grid_resolution - 0.01:
            added = False
            for val in order:
                if val >= grid_resolution and capacity_beats >= val and rem >= val - 0.01:
                    decomposed.append(val)
                    rem -= val
                    added = True
                    break
            if not added:
                decomposed.append(grid_resolution)
                rem -= grid_resolution
        return decomposed

    def beats_to_dur_code(b, is_rest=False):
        suffix = "r" if is_rest else ""
        if   b >= 4.0:  return "w"  + suffix
        elif b >= 3.0:  return "hd" + suffix
        elif b >= 2.0:  return "h"  + suffix
        elif b >= 1.5:  return "qd" + suffix
        elif b >= 1.0:  return "q"  + suffix
        elif b >= 0.75: return "8d" + suffix
        elif b >= 0.5:  return "8"  + suffix
        else:           return "16" + suffix

    # ── Assemble formatted notes ─────────────────────────────
    formatted_notes = []
    T_sheet = 0.0

    for i, chord in enumerate(chords):
        # Insert rests for any gap
        gap = chord["start_beat"] - T_sheet
        if gap >= 0.24:
            for rb in decompose_beats(gap):
                closest_rb = get_weighted_closest_beat(rb, supported_beats)
                dur_code   = beats_to_dur_code(closest_rb, is_rest=True)
                formatted_notes.append({
                    "pitch":         "rest",
                    "duration":      dur_code,
                    "beats":         closest_rb,
                    "absoluteIndex": -1
                })
            T_sheet = chord["start_beat"]

        # Determine chord duration
        if i < len(chords) - 1:
            max_available = chords[i + 1]["start_beat"] - chord["start_beat"]
        else:
            max_available = chord["duration_beats"]

        allowed_beats = [b for b in supported_beats if b <= max_available + 0.01]
        if not allowed_beats:
            allowed_beats = [0.25]

        closest_chord_beat = get_weighted_closest_beat(chord["duration_beats"], allowed_beats)
        dur_code = beats_to_dur_code(closest_chord_beat)

        pitch_names = [midi_to_note_name(p, use_flats) for p in chord["pitches"]]
        pitch_str   = ",".join(pitch_names)

        # Map event IDs to flat index
        if is_treble is None:
            abs_idx = len(formatted_notes)
            for eid in chord["event_ids"]:
                event_id_to_flat_index[eid] = abs_idx
        else:
            first_eid = chord["event_ids"][0] if chord["event_ids"] else None
            abs_idx   = event_id_to_flat_index.get(first_eid, -1) if first_eid is not None else -1

        formatted_notes.append({
            "pitch":        pitch_str,
            "duration":     dur_code,
            "beats":        closest_chord_beat,
            "pitch_beats":  chord["pitch_beats"],
            "absoluteIndex": abs_idx
        })
        T_sheet += closest_chord_beat

    # Pad to next integer beat to preserve overall duration alignment and complete measures
    if T_sheet > 0.0:
        next_int = math.ceil(T_sheet - 0.01)
        if next_int > T_sheet:
            gap = next_int - T_sheet
            for rb in decompose_beats(gap):
                closest_rb = get_weighted_closest_beat(rb, supported_beats)
                dur_code   = beats_to_dur_code(closest_rb, is_rest=True)
                formatted_notes.append({
                    "pitch":         "rest",
                    "duration":      dur_code,
                    "beats":         closest_rb,
                    "absoluteIndex": -1
                })
                T_sheet += closest_rb

    return formatted_notes


# ─────────────────────────────────────────────────────────────
# MUSICXML BUILDER (with ties, beams, dotted notes)
# ─────────────────────────────────────────────────────────────
def build_musicxml(treble_notes, bass_notes, time_sig, tempo, key_sig):
    note_id_counter = 0
    ts_parts     = time_sig.split('/')
    num_beats    = int(ts_parts[0]) if len(ts_parts) > 0 else 4
    beat_value   = int(ts_parts[1]) if len(ts_parts) > 1 else 4
    capacity_beats = (num_beats / beat_value) * 4.0

    def segment_into_measures(notes_list):
        """Slice a flat note list into measures, generating ties for cross-measure notes."""
        measures      = []
        current_m     = []
        current_beats = 0.0

        def get_note_beats(n):
            if "beats" in n:
                return n["beats"]
            dur = n.get("duration", "q")
            if dur.startswith("w"):   return 4.0
            if "d" in dur and dur.startswith("h"): return 3.0
            if dur.startswith("h"):   return 2.0
            if "d" in dur and dur.startswith("q"): return 1.5
            if dur.startswith("q"):   return 1.0
            if "d" in dur and dur.startswith("8"): return 0.75
            if dur.startswith("8"):   return 0.5
            if dur.startswith("16"):  return 0.25
            return 1.0

        def fill_rest(target_beats):
            rem = target_beats
            filled = []
            order = [4.0, 3.0, 2.0, 1.5, 1.0, 0.75, 0.5, 0.25]
            while rem >= 0.24:
                added = False
                for val in order:
                    if capacity_beats >= val and rem >= val - 0.01:
                        if   val >= 4.0:  dc = "wr"
                        elif val >= 3.0:  dc = "hdr"
                        elif val >= 2.0:  dc = "hr"
                        elif val >= 1.5:  dc = "qdr"
                        elif val >= 1.0:  dc = "qr"
                        elif val >= 0.75: dc = "8dr"
                        elif val >= 0.5:  dc = "8r"
                        else:             dc = "16r"
                        filled.append({"pitch": "rest", "duration": dc, "beats": val})
                        rem -= val
                        added = True
                        break
                if not added:
                    filled.append({"pitch": "rest", "duration": "16r", "beats": 0.25})
                    rem -= 0.25
            return filled

        for n in notes_list:
            nb = get_note_beats(n)
            remaining_in_measure = capacity_beats - current_beats

            if nb <= remaining_in_measure + 0.01:
                # Note fits completely in current measure
                current_m.append(n)
                current_beats += nb
            else:
                # Note crosses a barline — split with tie
                # Part 1: fill current measure
                part1_beats = remaining_in_measure
                if part1_beats >= 0.24:
                    note_copy = dict(n)
                    note_copy["beats"] = part1_beats
                    note_copy["tie_stop"] = n.get("tie_stop", False)
                    note_copy["tie_start"] = True
                    current_m.append(note_copy)

                # Pad remaining space with rests if any
                rem = capacity_beats - (current_beats + max(part1_beats, 0))
                if rem >= 0.24:
                    current_m.extend(fill_rest(rem))

                measures.append(current_m)
                current_m     = []
                current_beats = 0.0

                # Part 2: overflow into next measure (with tie stop)
                part2_beats = nb - max(part1_beats, 0)
                if part2_beats >= 0.24:
                    note_copy2 = dict(n)
                    note_copy2["beats"] = part2_beats
                    note_copy2["tie_stop"] = True
                    note_copy2["tie_start"] = n.get("tie_start", False)
                    current_m.append(note_copy2)
                    current_beats = part2_beats
                continue

            # If measure is full, flush it
            if current_beats >= capacity_beats - 0.01:
                rem = capacity_beats - current_beats
                if rem >= 0.24:
                    current_m.extend(fill_rest(rem))
                measures.append(current_m)
                current_m     = []
                current_beats = 0.0

        if current_m:
            rem = capacity_beats - current_beats
            if rem >= 0.24:
                current_m.extend(fill_rest(rem))
            measures.append(current_m)

        return measures

    treble_measures = segment_into_measures(treble_notes)
    bass_measures   = segment_into_measures(bass_notes)
    num_measures    = max(len(treble_measures), len(bass_measures), 1)

    key_fifths = {
        "C": 0,  "G": 1,  "D": 2,  "A": 3,  "E": 4,  "B": 5,  "F#": 6,  "C#": 7,
        "F": -1, "Bb": -2, "Eb": -3, "Ab": -4, "Db": -5, "Gb": -6, "Cb": -7,
        "a": 0,  "e": 1,  "b": 2,  "f#": 3, "c#": 4,  "g#": 5, "d#": 6,  "a#": 7,
        "d": -1, "g": -2, "c": -3, "f": -4, "bb": -5, "eb": -6, "ab": -7
    }
    fifths = key_fifths.get(key_sig, 0)
    mode   = "minor" if key_sig and key_sig[0].islower() else "major"

    def parse_pitch(p_str):
        if len(p_str) < 2:
            return None
        step   = p_str[0].upper()
        octave = int(p_str[-1]) if p_str[-1].isdigit() else 4
        acc    = ""
        for char in p_str[1:-1]:
            if char == "b":  acc = "flat"
            elif char == "#": acc = "sharp"
        return step, acc, octave

    xml = []
    xml.append('<?xml version="1.0" encoding="UTF-8" standalone="no"?>')
    xml.append('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">')
    xml.append('<score-partwise version="4.0">')
    xml.append('  <work><work-title>Transcribed Score</work-title></work>')
    xml.append('  <part-list>')
    xml.append('    <score-part id="P1"><part-name>Piano</part-name></score-part>')
    xml.append('  </part-list>')
    xml.append('  <part id="P1">')

    for m_idx in range(num_measures):
        xml.append(f'    <measure number="{m_idx + 1}">')

        if m_idx == 0:
            xml.append('      <attributes>')
            xml.append('        <divisions>4</divisions>')
            xml.append(f'        <key><fifths>{fifths}</fifths><mode>{mode}</mode></key>')
            xml.append(f'        <time><beats>{num_beats}</beats><beat-type>{beat_value}</beat-type></time>')
            xml.append('        <staves>2</staves>')
            xml.append('        <clef number="1"><sign>G</sign><line>2</line></clef>')
            xml.append('        <clef number="2"><sign>F</sign><line>4</line></clef>')
            xml.append('      </attributes>')
            xml.append('      <direction placement="above">')
            xml.append('        <direction-type>')
            xml.append(f'          <metronome><beat-unit>quarter</beat-unit><per-minute>{int(tempo)}</per-minute></metronome>')
            xml.append('        </direction-type>')
            xml.append(f'        <sound tempo="{int(tempo)}"/>')
            xml.append('      </direction>')

        def emit_notes(notes_list, voice_num, staff_num):
            """Emit MusicXML note elements for one stave in one measure."""
            nonlocal note_id_counter
            if not notes_list:
                dur = int(capacity_beats * 4)
                ts, dotted = get_type_string(capacity_beats)
                xml.append(f'      <note>')
                xml.append(f'        <rest measure="yes"/>')
                xml.append(f'        <duration>{dur}</duration>')
                xml.append(f'        <voice>{voice_num}</voice>')
                xml.append(f'        <type>{ts}</type>')
                xml.append(f'        <staff>{staff_num}</staff>')
                xml.append(f'      </note>')
                return

            # First pass: annotate with start beats for beam detection
            annotated_notes = []
            elapsed_beats = 0.0
            for note in notes_list:
                nb = note.get("beats", 1.0)
                annotated_notes.append({
                    "note": note,
                    "start_beat": elapsed_beats,
                    "beats": nb
                })
                elapsed_beats += nb

            # Group into steps (chord detection)
            steps = []
            for an in annotated_notes:
                if not steps or abs(an["start_beat"] - steps[-1]["start_beat"]) > 0.01:
                    steps.append({
                        "start_beat": an["start_beat"],
                        "beats": an["beats"],
                        "notes": [an["note"]],
                        "beam_tags": {}
                    })
                else:
                    steps[-1]["notes"].append(an["note"])

            # Beam detection: group consecutive short notes in each half-measure
            for start_bound, end_bound in [(0.0, 2.0), (2.0, 4.0)]:
                eligible_indices = []
                for idx, step in enumerate(steps):
                    if step["beats"] <= 0.51 and step["notes"][0]["pitch"] != "rest":
                        if start_bound <= step["start_beat"] < end_bound:
                            eligible_indices.append(idx)

                groups = []
                current_group = []
                for idx in eligible_indices:
                    if not current_group or idx == current_group[-1] + 1:
                        current_group.append(idx)
                    else:
                        if len(current_group) >= 2:
                            groups.append(current_group)
                        current_group = [idx]
                if len(current_group) >= 2:
                    groups.append(current_group)

                for g in groups:
                    for i, idx in enumerate(g):
                        if i == 0:
                            steps[idx]["beam_tags"][1] = "begin"
                        elif i == len(g) - 1:
                            steps[idx]["beam_tags"][1] = "end"
                        else:
                            steps[idx]["beam_tags"][1] = "continue"

                        # Beam level 2 for 16th notes
                        if steps[idx]["beats"] <= 0.26:
                            has_prev_16th = (i > 0 and steps[g[i - 1]]["beats"] <= 0.26)
                            has_next_16th = (i < len(g) - 1 and steps[g[i + 1]]["beats"] <= 0.26)

                            if has_prev_16th and has_next_16th:
                                steps[idx]["beam_tags"][2] = "continue"
                            elif has_prev_16th:
                                steps[idx]["beam_tags"][2] = "end"
                            elif has_next_16th:
                                steps[idx]["beam_tags"][2] = "begin"
                            else:
                                steps[idx]["beam_tags"][2] = "backward hook" if i > 0 else "forward hook"

            # Generate XML for steps
            for step in steps:
                nb        = step["beats"]
                dur       = max(int(round(nb * 4)), 1)
                type_str, is_dotted = get_type_string(nb)
                beam_tags = step["beam_tags"]

                # Assign a unique ID for this step if it has any non-tie-stop playable notes
                step_id = None
                has_playable = any(n["pitch"] != "rest" and not n.get("tie_stop", False) for n in step["notes"])
                if has_playable:
                    step_id = note_id_counter
                    note_id_counter += 1

                for n_idx, note in enumerate(step["notes"]):
                    tie_start = note.get("tie_start", False)
                    tie_stop  = note.get("tie_stop", False)

                    if note["pitch"] == "rest":
                        note_id_attr = ""
                    elif tie_stop:
                        note_id_attr = ""
                    else:
                        note_id_attr = f' id="n{step_id}"' if step_id is not None else ""

                    if note["pitch"] == "rest":
                        xml.append(f'      <note{note_id_attr}>')
                        xml.append('        <rest/>')
                        xml.append(f'        <duration>{dur}</duration>')
                        xml.append(f'        <voice>{voice_num}</voice>')
                        xml.append(f'        <type>{type_str}</type>')
                        if is_dotted:
                            xml.append('        <dot/>')
                        xml.append(f'        <staff>{staff_num}</staff>')
                        xml.append('      </note>')
                    else:
                        pitches_list = note["pitch"].split(",")
                        for p_idx, p in enumerate(pitches_list):
                            parsed = parse_pitch(p)
                            if not parsed:
                                continue
                            step_pitch, acc, octave = parsed
                            xml.append(f'      <note{note_id_attr}>')
                            if p_idx > 0 or n_idx > 0:
                                xml.append('        <chord/>')

                            # Tie stop (this note is the continuation of a tied note)
                            if tie_stop and p_idx == 0 and n_idx == 0:
                                xml.append('        <tie type="stop"/>')

                            xml.append('        <pitch>')
                            xml.append(f'          <step>{step_pitch}</step>')
                            if acc == "flat":   xml.append('          <alter>-1</alter>')
                            elif acc == "sharp": xml.append('          <alter>1</alter>')
                            xml.append(f'          <octave>{octave}</octave>')
                            xml.append('        </pitch>')
                            xml.append(f'        <duration>{dur}</duration>')

                            # Tie start (this note continues into the next measure)
                            if tie_start and p_idx == 0 and n_idx == 0:
                                xml.append('        <tie type="start"/>')

                            xml.append(f'        <voice>{voice_num}</voice>')
                            xml.append(f'        <type>{type_str}</type>')
                            if is_dotted:
                                xml.append('        <dot/>')
                            if acc:
                                xml.append(f'        <accidental>{acc}</accidental>')
                            xml.append(f'        <staff>{staff_num}</staff>')

                            # Add notations block for ties
                            if (tie_start or tie_stop) and p_idx == 0 and n_idx == 0:
                                xml.append('        <notations>')
                                if tie_stop:
                                    xml.append('          <tied type="stop"/>')
                                if tie_start:
                                    xml.append('          <tied type="start"/>')
                                xml.append('        </notations>')

                            # Beam elements (only on primary note of chord)
                            if p_idx == 0 and n_idx == 0:
                                for b_num, b_val in sorted(beam_tags.items()):
                                    xml.append(f'        <beam number="{b_num}">{b_val}</beam>')

                            xml.append('      </note>')

        tr_m = treble_measures[m_idx] if m_idx < len(treble_measures) else []
        bs_m = bass_measures[m_idx]   if m_idx < len(bass_measures)   else []

        emit_notes(tr_m, voice_num=1, staff_num=1)

        # Backup to start of measure for bass stave
        backup_duration = int(capacity_beats * 4)
        xml.append('      <backup>')
        xml.append(f'        <duration>{backup_duration}</duration>')
        xml.append('      </backup>')

        emit_notes(bs_m, voice_num=5, staff_num=2)
        xml.append('    </measure>')

    xml.append('  </part>')
    xml.append('</score-partwise>')
    xml_str = "\n".join(xml)
    
    try:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(xml_str)
        
        # Log divisions
        divisions_el = root.find(".//divisions")
        divisions = int(divisions_el.text) if divisions_el is not None else 4
        print(f"[AUDIT] Backend XML divisions: {divisions}")
        
        expected_durations = {
            "whole": {"dotted": divisions * 6, "normal": divisions * 4},
            "half": {"dotted": divisions * 3, "normal": divisions * 2},
            "quarter": {"dotted": divisions * 1.5, "normal": divisions * 1},
            "eighth": {"dotted": divisions * 0.75, "normal": divisions * 0.5},
            "16th": {"dotted": divisions * 0.375, "normal": divisions * 0.25}
        }
        
        print("[AUDIT] Starting backend MusicXML notes audit...")
        mismatch_count = 0
        for note in root.findall(".//note"):
            # 1. Pitch
            pitch = "rest"
            rest = note.find("rest")
            if rest is None:
                step = note.find(".//step")
                octave = note.find(".//octave")
                alter = note.find(".//alter")
                if step is not None and octave is not None:
                    step_val = step.text
                    oct_val = octave.text
                    alt_val = ""
                    if alter is not None:
                        if alter.text == "1":
                            alt_val = "#"
                        elif alter.text == "-1":
                            alt_val = "b"
                    pitch = f"{step_val}{alt_val}{oct_val}"
            
            # 2. Duration
            duration_el = note.find("duration")
            duration = int(duration_el.text) if duration_el is not None else 0
            
            # 3. Type
            type_el = note.find("type")
            type_str = type_el.text if type_el is not None else ""
            
            # 4. Dot
            dot = note.find("dot") is not None
            
            print(f"[AUDITED NOTE] pitch={pitch} duration={duration} type={type_str} dot={dot}")
            
            # Verify duration
            expected_entry = expected_durations.get(type_str)
            is_mismatch = False
            expected = -1
            if expected_entry:
                expected = expected_entry["dotted"] if dot else expected_entry["normal"]
                if duration != expected:
                    is_mismatch = True
            elif type_str:
                is_mismatch = True
                
            if is_mismatch:
                mismatch_count += 1
                print(f"[DURATION MISMATCH] pitch={pitch} type={type_str} dot={dot} actual_duration={duration} expected_duration={expected}")
                
        print(f"[AUDIT] Backend MusicXML notes audit complete. Mismatches found: {mismatch_count}")
        pitch_notes_count = len([n for n in root.findall(".//note") if n.find("rest") is None])
        print(f"[COUNT] Written To MusicXML: {pitch_notes_count}")
    except Exception as e:
        print("[AUDIT ERROR] Backend XML audit failed:", e)

    return xml_str


def detect_tempo_confidence(raw_note_events, audio, sr):
    """
    Determine if the audio contains sufficient rhythmic information for tempo estimation.
    Returns: (confidence_string, reasons_list, beat_strength)
    """
    reasons = []

    # 1. Onset count
    onset_count = len(raw_note_events)
    if onset_count < 3:
        reasons.append(f"onset_count={onset_count} < 3")

    # 2. Distinct attacks (separated by > 0.05 seconds)
    onsets = sorted([e[0] for e in raw_note_events])
    distinct_attacks = 0
    last_onset = -999.0
    for o in onsets:
        if o - last_onset > 0.05:
            distinct_attacks += 1
            last_onset = o
    if distinct_attacks < 3:
        reasons.append(f"distinct_attacks={distinct_attacks} < 3")

    # 3. Beat tracking confidence / strength
    beat_strength = 0.0
    try:
        # Avoid computing on extremely long files to save time, limit to 25s for tempogram
        max_samples = sr * 25
        clip_y = audio[:max_samples] if len(audio) > max_samples else audio

        onset_env = librosa.onset.onset_strength(y=clip_y, sr=sr)

        # Check peaks in onset envelope
        # If the number of peaks is less than 3, it's low confidence
        peaks = librosa.util.peak_pick(
            onset_env,
            pre_max=3,
            post_max=3,
            pre_avg=3,
            post_avg=5,
            delta=0.5,
            wait=10
        )
        peak_count = len(peaks)
        if peak_count < 3:
            reasons.append(f"onset_envelope_peaks={peak_count} < 3")

        # Compute tempogram to measure beat periodic strength
        tg = librosa.feature.tempogram(y=clip_y, sr=sr, hop_length=512)
        tg_mean = np.mean(tg, axis=1)
        bpms = librosa.tempo_frequencies(len(tg_mean), sr=sr, hop_length=512)

        # Focus on musical range [50, 200] BPM
        mask = (bpms >= 50) & (bpms <= 200)
        if mask.any():
            beat_strength = float(np.max(tg_mean[mask]))

        if beat_strength < 0.15:
            reasons.append(f"beat_strength={beat_strength:.3f} < 0.15")
    except Exception as e:
        reasons.append(f"beat_confidence_error={str(e)}")

    if reasons:
        return "LOW", reasons, beat_strength
    else:
        return "HIGH", [], beat_strength


# ─────────────────────────────────────────────────────────────
# MUSICAL REDUCTION ENGINE & A/B METRICS
# ─────────────────────────────────────────────────────────────
def extract_melody_graph(note_events, tempo):
    if len(note_events) < 2:
        return note_events

    # Sort events by start time, and then by pitch descending (for tie-breaking)
    events = sorted(note_events, key=lambda e: (e[0], -e[2]))
    N = len(events)
    
    G = nx.DiGraph()
    
    # Add virtual nodes
    G.add_node("source")
    G.add_node("sink")
    
    # Add note nodes with their attributes
    for i in range(N):
        G.add_node(i, onset=events[i][0], offset=events[i][1], pitch=events[i][2], velocity=events[i][3])
        
    # Connect source to notes starting within the first onset cluster (first_onset + 0.5s)
    first_onset = events[0][0]
    for i in range(N):
        if events[i][0] <= first_onset + 0.5:
            duration = events[i][1] - events[i][0]
            velocity = events[i][3]
            weight = 0.5 * max(0.0, 3.0 - duration) + 0.5 * max(0.0, 1.0 - velocity) + 0.01
            G.add_edge("source", i, weight=weight)
            
    # Connect notes to sink if they end within 1.5s of the last note's offset (with fallback)
    last_offset = max(e[1] for e in events)
    sink_window = 0.5
    sink_candidates = []
    while not sink_candidates and sink_window <= 10.0:
        sink_candidates = [i for i in range(N) if events[i][1] >= last_offset - sink_window]
        if not sink_candidates:
            sink_window += 0.5

    for i in sink_candidates:
        G.add_edge(i, "sink", weight=0.01)
            
    # Connect notes to notes
    for i in range(N):
        onset_i = events[i][0]
        pitch_i = events[i][2]
        
        # Distinct onset times of notes starting after onset_i
        future_onsets = sorted(list(set(events[j][0] for j in range(i + 1, N) if events[j][0] - onset_i >= 0.05)))
        
        # We will connect to notes starting at the first 3 future onset times, provided they are within 2.5s
        connected = False
        for idx, target_onset in enumerate(future_onsets[:3]):
            if target_onset - onset_i > 2.5 and connected:
                break
            # Skip penalty: 0 for idx=0, 1.5 for idx=1, 3.0 for idx=2
            skip_penalty = 1.5 * idx
            
            for j in range(i + 1, N):
                if abs(events[j][0] - target_onset) < 0.001:
                    pitch_j = events[j][2]
                    duration_j = events[j][1] - events[j][0]
                    velocity_j = events[j][3]
                    
                    weight = (0.1 * abs(pitch_j - pitch_i) + 
                              0.5 * max(0.0, 3.0 - duration_j) + 
                              0.5 * max(0.0, 1.0 - velocity_j) + 
                              skip_penalty + 
                              0.01)
                    G.add_edge(i, j, weight=weight)
                    connected = True
                    
        # Fallback if no connections made for this node (connect to next closest onset)
        if not G.out_edges(i) and i not in sink_candidates:
            for j in range(i + 1, N):
                if events[j][0] - onset_i >= 0.05:
                    pitch_j = events[j][2]
                    duration_j = events[j][1] - events[j][0]
                    velocity_j = events[j][3]
                    weight = (0.1 * abs(pitch_j - pitch_i) + 
                              0.5 * max(0.0, 3.0 - duration_j) + 
                              0.5 * max(0.0, 1.0 - velocity_j) + 
                              5.0)  # High penalty for long jump
                    G.add_edge(i, j, weight=weight)
                    break
            
    # Find shortest path
    try:
        path = nx.shortest_path(G, source="source", target="sink", weight="weight")
        melody_indices = [node for node in path if isinstance(node, int)]
        melody_events = [events[idx] for idx in melody_indices]
        return melody_events
    except nx.NetworkXNoPath:
        # Fallback: greedy highest pitch at each onset
        onset_groups = defaultdict(list)
        for ev in events:
            rounded_onset = round(ev[0] * 20.0) / 20.0
            onset_groups[rounded_onset].append(ev)
        
        melody_events = []
        for k in sorted(onset_groups.keys()):
            best_note = max(onset_groups[k], key=lambda x: x[2])
            melody_events.append(best_note)
        return melody_events


def musical_reduction_engine(note_events, mode="advanced", melody_priority=False, tempo=120.0, capacity_beats=4.0):
    if not note_events:
        return []
        
    # Standardize input: ensure they are list format
    events = [list(e) for e in note_events]
    
    # 1. Melody Prioritization (if melody_priority=True)
    if melody_priority:
        events = extract_melody_graph(events, tempo)
        
    # 2. Chord Density Reduction & Polyphonic Simplification / Chord Validation
    # Group into simultaneous onset clusters (tolerance = 0.05 seconds)
    events = sorted(events, key=lambda e: e[0])
    clusters = []
    for ev in events:
        if not clusters or (ev[0] - clusters[-1][0][0]) > 0.05:
            clusters.append([ev])
        else:
            clusters[-1].append(ev)
            
    reduced_events = []
    for cluster in clusters:
        if not cluster:
            continue
        # Sort notes in cluster by pitch ascending
        cluster.sort(key=lambda e: e[2])
        
        if mode == "beginner":
            # Beginner mode: keep only the highest pitch note (melody)
            reduced_events.append(cluster[-1])
        elif mode == "intermediate":
            # Intermediate mode: keep melody (highest pitch) and bass (lowest pitch)
            reduced_events.append(cluster[-1])
            if len(cluster) > 1:
                reduced_events.append(cluster[0])
        else:  # advanced mode
            # If chord density exceeds 3 (or chord validation for 5+ mixed confidence)
            # Rank notes by confidence and melodic importance.
            # Keep melody (highest) and bass (lowest) notes.
            # Keep the loudest of the remaining notes.
            if len(cluster) > 3:
                kept = [cluster[0], cluster[-1]] # Keep bass and melody
                middle_notes = cluster[1:-1]
                # Sort middle notes by velocity (index 3) descending
                middle_notes.sort(key=lambda e: e[3], reverse=True)
                # Keep the loudest middle note to make it at most 3 notes
                kept.append(middle_notes[0])
                reduced_events.extend(kept)
            else:
                reduced_events.extend(cluster)
                
    events = sorted(reduced_events, key=lambda e: e[0])
    
    # 3. Note Density Analysis
    # Segment into measures and report density. If it exceeds 16, reduce off-beat low-confidence notes.
    measure_duration_sec = capacity_beats * (60.0 / tempo)
    measures = defaultdict(list)
    for ev in events:
        measure_idx = int(ev[0] / measure_duration_sec)
        measures[measure_idx].append(ev)
        
    final_events = []
    for m_idx, m_notes in sorted(measures.items()):
        notes_per_measure = len(m_notes)
        print(f"[Reduction Engine] Measure {m_idx}: notes_per_measure = {notes_per_measure}")
        
        # If density exceeds 8, attempt reduction
        if notes_per_measure > 8:
            kept_m_notes = []
            for ev in m_notes:
                # Calculate beat position relative to tempo
                beat_pos = ev[0] / (60.0 / tempo)
                # Distance to nearest eighth-note grid (multiple of 0.5)
                dist = abs(beat_pos - round(beat_pos * 2.0) / 2.0)
                is_off_beat = dist > 0.1
                
                # If off-beat and low velocity, filter out
                if is_off_beat and ev[3] < 0.60:
                    continue
                kept_m_notes.append(ev)
            final_events.extend(kept_m_notes)
        else:
            final_events.extend(m_notes)
            
    # Sort final events by start time, then by pitch ascending
    return sorted(final_events, key=lambda e: (e[0], e[2]))


def calculate_ab_metrics(version_a, version_b):
    # Group version_a into chords
    events_a = sorted(version_a, key=lambda e: e[0])
    clusters_a = []
    for ev in events_a:
        if not clusters_a or (ev[0] - clusters_a[-1][0][0]) > 0.05:
            clusters_a.append([ev])
        else:
            clusters_a[-1].append(ev)
    chord_count_a = len(clusters_a)
    avg_chord_size_a = len(events_a) / max(chord_count_a, 1)
    
    # Group version_b into chords
    events_b = sorted(version_b, key=lambda e: e[0])
    clusters_b = []
    for ev in events_b:
        if not clusters_b or (ev[0] - clusters_b[-1][0][0]) > 0.05:
            clusters_b.append([ev])
        else:
            clusters_b[-1].append(ev)
    chord_count_b = len(clusters_b)
    avg_chord_size_b = len(events_b) / max(chord_count_b, 1)
    
    # Calculate listenability improvement
    # Clutter is defined by extremely large chords (size > 3) and high density (>16 per measure).
    # Since reduction cleans it up, we can model a simulated listenability rating (0 to 100).
    # Penalty for large chords in version a
    large_chords_a = sum(1 for c in clusters_a if len(c) > 3)
    large_chords_b = sum(1 for c in clusters_b if len(c) > 3)
    
    listenability_a = max(10.0, 100.0 - (large_chords_a * 5.0) - (len(events_a) * 0.1))
    listenability_b = max(10.0, 100.0 - (large_chords_b * 5.0) - (len(events_b) * 0.1))
    # Cap listenability to reasonable bounds
    listenability_a = min(95.0, max(20.0, listenability_a))
    listenability_b = min(98.0, max(50.0, listenability_b))
    
    if len(version_b) == len(version_a):
        listenability_b = listenability_a
        
    return {
        "version_a": {
            "note_count": len(version_a),
            "chord_count": chord_count_a,
            "avg_chord_size": round(avg_chord_size_a, 2),
            "listenability_score": round(listenability_a, 1)
        },
        "version_b": {
            "note_count": len(version_b),
            "chord_count": chord_count_b,
            "avg_chord_size": round(avg_chord_size_b, 2),
            "listenability_score": round(listenability_b, 1)
        },
        "metrics_comparison": {
            "notes_removed": len(version_a) - len(version_b),
            "reduction_percentage": round(((len(version_a) - len(version_b)) / max(len(version_a), 1)) * 100.0, 1),
            "listenability_improvement": round(max(0.0, listenability_b - listenability_a), 1)
        }
    }


# ─────────────────────────────────────────────────────────────
# MAIN AUDIO ANALYSIS ENTRY POINT
# ─────────────────────────────────────────────────────────────
def analyze_audio(filepath, monophonic=False, mode="advanced", melody_priority=False, use_spleeter="auto", use_pitch_refinement="auto", use_ensemble="auto", speed_preset="accurate"):
    """
    Full professional-grade pipeline with round-trip self-tuning:
      1. ByteDance Piano Transcription (CRNN, MAESTRO-trained)
      2. Onset peak alignment (snaps to physical onset peaks)
      3. Octave correction (high-note bias, melodic leap, cluster duplicates)
      4. Initial librosa beat_track estimate
      5. SELF-TUNING LOOP: tries different (gap_threshold, tempo) combos
         -> synthesize piano audio -> chromagram comparison -> pick best params
      6. Time signature detection (3/4, 4/4, 6/8) using best tempo
      7. Key signature estimation (pitch-class duration histogram)
      8. Stateful voice separation (continuity-aware left/right hand)
      9. 16th-note grid quantization
      10. MusicXML generation (ties, beams, dotted notes, key/time sig)
      11. Full quality scores returned (pitch, rhythm, tempo, chroma, overall)
    """
    if monophonic:
        mode = "beginner"
    # -- 1. Load and Preprocess Audio (Phase 9) -------------
    from preprocess import preprocess_audio
    audio, sr, complexity_info = preprocess_audio(filepath, target_sr=PT_SR, use_spleeter=use_spleeter, speed_preset=speed_preset)
    audio = audio[: PT_SR * 120]   # Limit to 2 minutes

    # Initialize transparency logging tracker for activated modules and reasons
    activated_modules = {
        "spleeter": bool(complexity_info.get("spleeter_activated", False)),
        "hpss": bool(complexity_info.get("hpss_activated", False)),
        "torchcrepe": False,
        "pyin": False,
        "basic_pitch_ensemble": False,
        "butterworth_filter": True,
        "spectral_gating": bool(complexity_info.get("spectral_gating_activated", False))
    }
    
    activation_reasons = {
        "butterworth_filter": "Always active as baseline preprocessing",
        "spleeter": complexity_info.get("spleeter_reason", "Bypassed (not requested)"),
        "hpss": complexity_info.get("hpss_reason", "Bypassed (vocals not detected)"),
        "spectral_gating": complexity_info.get("spectral_gating_reason", "Bypassed (Noise floor <= threshold)")
    }

    transcriber = _get_transcriber()
    transcribed_dict = transcriber.transcribe(audio, None)

    audio_len_sec = len(audio) / PT_SR

    raw_note_events = []
    for note in transcribed_dict['est_note_events']:
        onset  = float(min(note['onset_time'], audio_len_sec))
        offset = float(min(note['offset_time'], audio_len_sec))
        pitch  = int(note['midi_note'])
        vel    = float(note['velocity'] / 127.0)
        
        # Discard note events starting near or after the end of the audio
        if onset >= audio_len_sec - 0.05:
            continue
            
        # Denoise short, quiet, extremely high-pitched click artifacts
        if pitch > 85 and (offset - onset) < 0.20 and vel < 0.55:
            continue
            
        # Discard general quiet, short transient noise clicks
        if (offset - onset) < 0.06 and vel < 0.25:
            continue
            
        if offset - onset < 0.08:
            offset = float(min(onset + 0.08, audio_len_sec))
        raw_note_events.append([onset, offset, pitch, vel, None])

    # -- Calculate polyphony count and average velocity of raw notes --
    avg_velocity = sum(ev[3] for ev in raw_note_events) / len(raw_note_events) if raw_note_events else 0.0
    max_concurrent_notes = 0
    if raw_note_events:
        events_on_off = []
        for ev in raw_note_events:
            events_on_off.append((ev[0], 1))
            events_on_off.append((ev[1], -1))
        events_on_off.sort(key=lambda x: (x[0], x[1]))
        current_active = 0
        for time, change in events_on_off:
            current_active += change
            if current_active > max_concurrent_notes:
                max_concurrent_notes = current_active

    # -- Ensemble with OpenAI Basic Pitch if requested/needed --
    should_ensemble = False
    ensemble_reason = "Bypassed (not requested)"
    if speed_preset == "fast":
        ensemble_reason = "Bypassed (Speed preset is 'fast')"
    else:
        if use_ensemble == "true":
            should_ensemble = True
            ensemble_reason = "Active (explicitly requested)"
        elif use_ensemble == "auto":
            if max_concurrent_notes >= 3:
                should_ensemble = True
                ensemble_reason = f"Active (Polyphony detected: max concurrent notes {max_concurrent_notes} >= 3)"
            elif avg_velocity < 0.60:
                should_ensemble = True
                ensemble_reason = f"Active (Low confidence detected: average velocity {avg_velocity:.2f} < 0.60)"
            else:
                ensemble_reason = f"Bypassed (Polyphony {max_concurrent_notes} < 3 and average velocity {avg_velocity:.2f} >= 0.60)"
            
    if should_ensemble:
        bp_notes = get_basic_pitch_notes(filepath)
        print(f"[COUNT] After Basic Pitch: {len(bp_notes)}")
        raw_note_events, ensemble_act = ensemble_note_events(raw_note_events, bp_notes)
        activated_modules["basic_pitch_ensemble"] = ensemble_act
        if ensemble_act:
            ensemble_reason = "Active (Basic Pitch ensembled successfully)"
        else:
            ensemble_reason = "Bypassed (Basic Pitch ensembled but no new notes matched)"
    else:
        activated_modules["basic_pitch_ensemble"] = False
        print(f"[COUNT] After Basic Pitch: 0")
    
    activation_reasons["basic_pitch_ensemble"] = ensemble_reason

    # -- 2.5. Sustain Pedal Note Extension ------------------
    pedal_events = transcribed_dict.get('est_pedal_events', [])
    for pedal in pedal_events:
        pedal['onset_time'] = float(min(pedal['onset_time'], audio_len_sec))
        pedal['offset_time'] = float(min(pedal['offset_time'], audio_len_sec))
        
    raw_note_events = extend_notes_by_pedal(raw_note_events, pedal_events)
    # Ensure all offsets are strictly bounded by audio duration
    for ev in raw_note_events:
        ev[1] = float(min(ev[1], audio_len_sec))
        if ev[1] < ev[0] + 0.08:
            ev[1] = float(min(ev[0] + 0.08, audio_len_sec))

    # Shift all events so that the first note event starts at exactly 0.0s
    if raw_note_events:
        min_onset = float(min(ev[0] for ev in raw_note_events))
        for ev in raw_note_events:
            ev[0] = float(max(0.0, ev[0] - min_onset))
            ev[1] = float(max(ev[0] + 0.08, ev[1] - min_onset))

    # -- 3. Onset Peak Alignment (REMOVED) --

    # -- 4. Octave correction (applied once, before tuning) --
    raw_note_events = correct_octaves(raw_note_events, cluster_window=0.08)
    print(f"[COUNT] After Pitch Validation: {len(raw_note_events)}")

    # -- F0 Pitch Refinement (Torchcrepe / pYIN) -------------
    raw_note_events, f0_method, f0_reason = refine_pitches_with_f0(raw_note_events, audio, PT_SR, use_pitch_refinement, complexity_info, speed_preset)
    if f0_method == "Torchcrepe":
        activated_modules["torchcrepe"] = True
        activation_reasons["torchcrepe"] = f0_reason
        activation_reasons["pyin"] = "Bypassed (Torchcrepe ran successfully)"
    elif f0_method == "pYIN":
        activated_modules["pyin"] = True
        activation_reasons["pyin"] = f0_reason
        activation_reasons["torchcrepe"] = "Bypassed (Torchcrepe failed or unavailable, pYIN ran)"
    else:
        activation_reasons["torchcrepe"] = f0_reason
        activation_reasons["pyin"] = f0_reason
    print(f"[COUNT] After pYIN: {len(raw_note_events)}")

    # -- 5. Tempo Confidence Detection & Fallback  -----------
    tempo_confidence, confidence_reasons, beat_strength = detect_tempo_confidence(raw_note_events, audio, PT_SR)
    print(f"[analyze] Tempo confidence: {tempo_confidence} (Reasons: {confidence_reasons}, Beat Strength: {beat_strength:.3f})")

    duration_preserved = False
    if tempo_confidence == "LOW":
        tempo_candidates = [120.0]
        lb_tempo = 120.0
        duration_preserved = True
    else:
        try:
            lb_tempo, _ = librosa.beat.beat_track(y=audio, sr=PT_SR)
            if isinstance(lb_tempo, np.ndarray):
                lb_tempo = float(lb_tempo[0])
            else:
                lb_tempo = float(lb_tempo)
            if lb_tempo < 40 or lb_tempo > 240:
                lb_tempo = 120.0
        except Exception:
            lb_tempo = 120.0
        
        # Import here to avoid circular dependency
        from self_tune import get_tempo_candidates
        tempo_candidates = get_tempo_candidates(raw_note_events, audio, PT_SR, lb_tempo)

    # -- 6. SELF-TUNING LOOP ---------------------------------
    if SAFE_TRANSCRIPTION_MODE:
        print("[analyze] SAFE_TRANSCRIPTION_MODE active: Bypassing Harmonic Feedback Optimizer (self_tune).")
        note_events = list(raw_note_events)
        tempo = 120.0 if tempo_confidence == "LOW" else estimate_tempo_from_onsets(note_events, audio=audio, sr=PT_SR, fallback_tempo=lb_tempo)
        best_params = {
            "gap_threshold": 0.35,
            "grid_resolution": 0.25
        }
        quality_scores = {
            "chroma_similarity": 0.0,
            "pitch_accuracy": 0.0,
            "rhythm_accuracy": 0.0,
            "tempo_accuracy": 0.0,
            "overall_score": 0.0
        }
        grid_res = 0.25
    else:
        try:
            from self_tune import self_tune

            print(f"[analyze] Tempo candidates: {tempo_candidates}")
            print("[analyze] Running self-tuning loop...")

            note_events, tempo, best_params, quality_scores = self_tune(
                audio, PT_SR, raw_note_events, tempo_candidates,
                lb_tempo=lb_tempo, tempo_confidence=tempo_confidence, verbose=True
            )
            grid_res = best_params.get("grid_resolution", 0.25)
            print(f"[analyze] Self-tuning complete. Best tempo: {tempo} BPM, "
                  f"Best grid: {grid_res}, Overall: {quality_scores.get('overall_score', 0):.3f}")

        except Exception as e:
            print(f"Warning: self-tuning failed ({e}), falling back to fixed params")
            note_events = suppress_harmonics(raw_note_events, onset_tolerance=0.08)
            note_events = merge_fragmented_notes(note_events, gap_threshold=0.35)
            tempo = 120.0 if tempo_confidence == "LOW" else estimate_tempo_from_onsets(note_events, audio=audio, sr=PT_SR, fallback_tempo=lb_tempo)
            quality_scores = {
                "chroma_similarity": 0.0,
                "pitch_accuracy": 0.0,
                "rhythm_accuracy": 0.0,
                "tempo_accuracy": 0.0,
                "overall_score": 0.0
            }
            grid_res = 0.25

    print(f"[COUNT] After Optimizer: {len(note_events)}")

    # -- 6.5. Run Advanced Post-Processing Corrections -------
    try:
        print("[analyze] Applying advanced post-processing corrections...")
        best_key, use_flats = estimate_key_signature(note_events)
        note_events = apply_advanced_post_processing(
            note_events, audio, PT_SR, tempo, best_key, activated_modules, activation_reasons
        )
        
        # Recalculate round-trip quality scores after advanced corrections
        from evaluate import evaluate_round_trip
        quality_scores = evaluate_round_trip(
            audio, PT_SR, note_events, tempo, grid_resolution=grid_res
        )
        quality_scores["best_chroma"]          = quality_scores["chroma_similarity"]
        quality_scores["best_gap_threshold"]   = best_params.get("gap_threshold", 0.25) if 'best_params' in locals() else 0.25
        quality_scores["best_tempo"]           = tempo
        quality_scores["best_grid_resolution"] = grid_res
        print(f"[analyze] Advanced post-processing complete. Recalculated overall score: {quality_scores.get('overall_score', 0):.3f}")
    except Exception as ap_err:
        print(f"Warning: advanced post-processing failed ({ap_err})")

    # -- 7. Time signature detection -------------------------
    # Use unreduced notes for time signature detection to get the most accurate grid analysis
    best_ts = detect_time_signature(note_events, tempo)
    ts_parts = best_ts.split('/')
    num_beats_ts  = int(ts_parts[0])
    beat_value_ts = int(ts_parts[1])
    capacity_beats = (num_beats_ts / beat_value_ts) * 4.0

    # Keep a copy of original note events for A/B metrics comparison
    version_a_notes = [list(e) for e in note_events]

    print(f"[COUNT] Before Reduction: {len(note_events)}")

    # Run the Musical Reduction Engine
    if DEBUG_DISABLE_REDUCTION:
        print("[REDUCTION ENGINE BYPASSED]")
    else:
        note_events = musical_reduction_engine(
            note_events, 
            mode=mode, 
            melody_priority=melody_priority, 
            tempo=tempo, 
            capacity_beats=capacity_beats
        )

    print(f"[COUNT] After Reduction: {len(note_events)}")

    # Calculate A/B metrics comparison
    ab_metrics = calculate_ab_metrics(version_a_notes, note_events)

    # -- 8. Key signature estimation -------------------------
    best_key, use_flats = estimate_key_signature(note_events)

    # -- 9. Stateful voice separation -----------------------
    treble_raw, bass_raw = split_voices_stateful(note_events, cluster_window=0.08)

    # -- 10. Sort events and assign unique IDs ---------------
    sorted_all = sorted(note_events, key=lambda x: x[0])
    sorted_all_with_ids = [[e[0], e[1], e[2], e[3], idx] for idx, e in enumerate(sorted_all)]

    treble_with_ids = []
    bass_with_ids   = []
    for idx, ev in enumerate(sorted_all):
        new_ev = [ev[0], ev[1], ev[2], ev[3], idx]
        if any(abs(r[0] - ev[0]) < 0.001 and r[2] == ev[2] for r in treble_raw):
            treble_with_ids.append(new_ev)
        else:
            bass_with_ids.append(new_ev)

    # -- 11. Build flat note index (for playback sync) -------
    event_id_to_flat_index = {}
    _ = format_clef_notes(
        sorted_all_with_ids, None, tempo, use_flats, event_id_to_flat_index, capacity_beats, grid_resolution=grid_res, monophonic=monophonic
    )

    # -- 12. Generate treble / bass clef notes ---------------
    treble_notes = format_clef_notes(
        treble_with_ids, True, tempo, use_flats, event_id_to_flat_index, capacity_beats, grid_resolution=grid_res, monophonic=monophonic
    )
    bass_notes = format_clef_notes(
        bass_with_ids, False, tempo, use_flats, event_id_to_flat_index, capacity_beats, grid_resolution=grid_res, monophonic=monophonic
    )

    # -- 13. Flat note list for frontend ---------------------
    formatted_notes = format_clef_notes(
        sorted_all_with_ids, None, tempo, use_flats, event_id_to_flat_index, capacity_beats, grid_resolution=grid_res, monophonic=monophonic
    )

    # -- 14. Generate MusicXML --------------------------------
    before_xml_pitch_count = len([n for n in treble_notes if n.get("pitch") != "rest"]) + len([n for n in bass_notes if n.get("pitch") != "rest"])
    print(f"[COUNT] Before MusicXML: {before_xml_pitch_count}")
    musicxml_str = build_musicxml(treble_notes, bass_notes, best_ts, tempo, best_key)

    # -- 15. Format quality scores for frontend (percentage) -
    def to_pct(v):
        return round(float(v) * 100.0, 1)

    quality_display = {
        # Snake_case format
        "pitch_accuracy":    to_pct(quality_scores.get("pitch_accuracy",    0.0)),
        "rhythm_accuracy":   to_pct(quality_scores.get("rhythm_accuracy",   0.0)),
        "tempo_accuracy":    to_pct(quality_scores.get("tempo_accuracy",    0.0)),
        "chroma_similarity": to_pct(quality_scores.get("chroma_similarity", 0.0)),
        "overall_score":     to_pct(quality_scores.get("overall_score",     0.0)),
        "best_tempo":        int(quality_scores.get("best_tempo", tempo)),
        "best_gap_threshold": float(quality_scores.get("best_gap_threshold", 0.35)),
        "best_grid_resolution": float(quality_scores.get("best_grid_resolution", grid_res)),

        # CamelCase duplicates for frontend parsing robust compatibility
        "pitchAccuracy":     to_pct(quality_scores.get("pitch_accuracy",    0.0)),
        "rhythmAccuracy":    to_pct(quality_scores.get("rhythm_accuracy",   0.0)),
        "tempoAccuracy":     to_pct(quality_scores.get("tempo_accuracy",    0.0)),
        "chromaSimilarity":  to_pct(quality_scores.get("chroma_similarity", 0.0)),
        "overallScore":      to_pct(quality_scores.get("overall_score",     0.0)),
        "bestTempo":         int(quality_scores.get("best_tempo", tempo)),
        "bestGapThreshold":  float(quality_scores.get("best_gap_threshold", 0.35)),
        "bestGridResolution": float(quality_scores.get("best_grid_resolution", grid_res)),
    }

    # -- 16. Post-run error logging for adaptive thresholds --
    overall_score = quality_display.get("overall_score", 0.0)
    if overall_score < 75.0:
        errors_file = "past_errors.json"
        import datetime
        timestamp = datetime.datetime.now().isoformat()
        
        # Determine error type
        error_type = "general"
        noise_floor_db = complexity_info.get("noise_floor_db", -100.0)
        noise_threshold = complexity_info.get("noise_floor_threshold", -45.0)
        if noise_floor_db > noise_threshold:
            error_type = "high_noise"
        elif complexity_info.get("vocals_present", False):
            error_type = "vocals_or_clutter"
            
        new_error = {
            "timestamp": timestamp,
            "overall_score": overall_score,
            "error_type": error_type,
            "noise_floor_db": noise_floor_db,
            "zcr": complexity_info.get("zcr", 0.0),
            "flatness": complexity_info.get("flatness", 0.0),
            "centroid": complexity_info.get("centroid", 0.0),
            "density": complexity_info.get("density", 0.0)
        }
        
        existing_errors = []
        if os.path.exists(errors_file):
            try:
                import json
                with open(errors_file, "r") as f:
                    existing_errors = json.load(f)
                    if not isinstance(existing_errors, list):
                        existing_errors = []
            except Exception:
                existing_errors = []
                
        existing_errors.append(new_error)
        try:
            with open(errors_file, "w") as f:
                json.dump(existing_errors, f, indent=2)
            print(f"[analyze] Low quality detected ({overall_score}%). Logged error parameters to past_errors.json.")
        except Exception as e:
            print(f"[analyze] Failed to write to past_errors.json: {e}")

    return {
        "time_signature":  best_ts,
        "notes":           formatted_notes,
        "treble_notes":    treble_notes,
        "bass_notes":      bass_notes,
        "detected_tempo":  tempo,
        "tempo":           tempo,
        "tempo_confidence": tempo_confidence,
        "duration_preserved": duration_preserved,
        "musicxml":        musicxml_str,
        "quality_scores":  quality_display,
        "ab_metrics":      ab_metrics,
        "raw_note_events": note_events,
        "activated_modules": activated_modules,
        "activation_reasons": activation_reasons,
    }


if __name__ == "__main__":
    import sys
    filepath = "tyler.wav"
    if len(sys.argv) > 1:
        filepath = sys.argv[1]
    print(f"[analyze] Executing analyze_audio on {filepath}...")
    result = analyze_audio(filepath)
    print(f"File: {filepath}")
    print(f"Tempo: {result['detected_tempo']} BPM")
    print(f"Time Sig: {result['time_signature']}")
    print(f"Total notes (flat): {len(result['notes'])}")
    print(f"Treble notes: {len(result['treble_notes'])}")
    print(f"Bass notes: {len(result['bass_notes'])}")
    print("\nQuality Scores:")
    for k, v in result["quality_scores"].items():
        print(f"  {k}: {v}")
    print("\nFirst 10 flat notes:")
    for n in result['notes'][:10]:
        print(n)
    print("\nMusicXML (first 30 lines):")
    for line in result['musicxml'].split('\n')[:30]:
        print(line)
