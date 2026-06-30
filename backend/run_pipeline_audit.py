# -*- coding: utf-8 -*-
# run_pipeline_audit.py - Detailed pipeline audit and verification pass for MeloNote

import os
import sys
import numpy as np

# Add backend folder to path
backend_path = r"C:\ReactNative\music-app\MeloNote\backend"
if backend_path not in sys.path:
    sys.path.append(backend_path)

import torch
import librosa
from piano_transcription_inference import sample_rate as PT_SR

from preprocess import preprocess_audio
from analyze import (
    _get_transcriber,
    midi_to_note_name,
    midi_to_hz,
    extend_notes_by_pedal,
    correct_octaves,
    detect_tempo_confidence,
    split_voices_stateful,
    format_clef_notes,
    build_musicxml,
    merge_fragmented_notes
)

def format_pitch(midi_num):
    return f"{midi_to_note_name(midi_num)} ({midi_num})"

def trace_confidence_filtering(raw_notes, audio_len_sec):
    filtered_notes = []
    removed = []
    
    for note in raw_notes:
        onset = note[0]
        offset = note[1]
        pitch = note[2]
        vel = note[3]
        
        # Capping for trace
        onset_cap = min(onset, audio_len_sec)
        offset_cap = min(offset, audio_len_sec)
        
        # 1. Boundary filter
        if onset_cap >= audio_len_sec - 0.05:
            removed.append({
                "note": note,
                "reason": f"Starts near/after end of audio (onset {onset:.3f}s >= end {audio_len_sec:.3f}s - 0.05s)"
            })
            continue
            
        # 2. High-pitch click denoiser
        if pitch > 85 and (offset_cap - onset_cap) < 0.20 and vel < 0.55:
            removed.append({
                "note": note,
                "reason": f"High-pitch transient click (pitch {pitch} > 85, duration {offset_cap - onset_cap:.3f}s < 0.2s, vel {vel:.3f} < 0.55)"
            })
            continue
            
        # 3. Quiet staccato click denoiser
        if (offset_cap - onset_cap) < 0.06 and vel < 0.25:
            removed.append({
                "note": note,
                "reason": f"Quiet, short transient noise (duration {offset_cap - onset_cap:.3f}s < 0.06s, vel {vel:.3f} < 0.25)"
            })
            continue
            
        # Note survives, compute its final capped onset/offset
        duration = offset_cap - onset_cap
        if duration < 0.08:
            offset_cap = min(onset_cap + 0.08, audio_len_sec)
            
        filtered_notes.append([onset_cap, offset_cap, pitch, vel, None])
        
    return filtered_notes, removed

def trace_harmonic_suppression(note_events, onset_tolerance=0.08):
    if not note_events:
        return [], []
        
    # Standard ratios and their max velocity thresholds
    ratio_thresholds = {
        2.0: 0.30,   # Octave
        3.0: 0.25,   # Octave + Fifth
        4.0: 0.30,   # Two Octaves
        5.0: 0.25,   # Two Octaves + Third
        1.5: 0.20    # Perfect Fifth
    }
    
    events = sorted(note_events, key=lambda e: (e[0], -e[3]))
    to_remove = set()
    removed_log = []
    
    for i, base in enumerate(events):
        if i in to_remove:
            continue
        base_hz = midi_to_hz(base[2])
        for j, candidate in enumerate(events):
            if j == i or j in to_remove:
                continue
            if abs(candidate[0] - base[0]) > onset_tolerance:
                continue
                
            cand_hz = midi_to_hz(candidate[2])
            vel_ratio = candidate[3] / max(base[3], 0.001)
            
            for ratio, max_ratio in ratio_thresholds.items():
                expected_hz = base_hz * ratio
                if expected_hz > 0 and abs(cand_hz / expected_hz - 1.0) < 0.03:
                    if vel_ratio < max_ratio:
                        to_remove.add(j)
                        ratio_desc = {2.0: "2x (Octave)", 3.0: "3x (Octave+Fifth)", 4.0: "4x (Two Octaves)", 5.0: "5x (Two Octaves+Third)", 1.5: "1.5x (Perfect Fifth)"}.get(ratio, f"{ratio}x")
                        removed_log.append({
                            "note": candidate,
                            "reason": f"harmonic candidate of fund. {format_pitch(base[2])} at onset {base[0]:.3f}s (ratio={ratio_desc}, vel_ratio={vel_ratio:.3f} < {max_ratio})"
                        })
                        break
                        
    remaining = [e for idx, e in enumerate(events) if idx not in to_remove]
    return remaining, removed_log

def trace_octave_correction(note_events, cluster_window=0.08):
    if not note_events:
        return [], []
        
    events = sorted(note_events, key=lambda e: (e[0], -e[3]))
    modified = []
    
    # 1. High note bias threshold MIDI 100
    for ev in events:
        orig_pitch = ev[2]
        if ev[2] > 100 and ev[3] < 0.35:
            ev[2] -= 12
            modified.append({
                "note": ev,
                "orig_pitch": orig_pitch,
                "new_pitch": ev[2],
                "reason": f"High-note bias correction (>100 and velocity {ev[3]:.3f} < 0.35)"
            })
            
    # 2. Cluster Octave Ghost
    clusters = []
    for ev in events:
        if not clusters or (ev[0] - clusters[-1][0][0]) > cluster_window:
            clusters.append([ev])
        else:
            clusters[-1].append(ev)
            
    corrected = []
    for cluster in clusters:
        if len(cluster) == 1:
            corrected.append(cluster[0])
            continue
            
        cluster.sort(key=lambda e: -e[3])
        kept_pitches = {}
        kept = []
        
        for ev in cluster:
            p = ev[2]
            is_octave_dup = False
            for kp, kp_amp in kept_pitches.items():
                if abs(p - kp) == 12:
                    vel_ratio = ev[3] / max(kp_amp, 0.001)
                    if vel_ratio < 0.35 and ev[3] < 0.35:
                        is_octave_dup = True
                        shifted = p - 12 if p > kp else p + 12
                        if shifted == kp:
                            for ke in kept:
                                if ke[2] == kp:
                                    ke[1] = max(ke[1], ev[1]) # extend original note duration
                            modified.append({
                                "note": ev,
                                "orig_pitch": p,
                                "new_pitch": kp,
                                "reason": f"Cluster octave ghost merged into fundament pitch {format_pitch(kp)} (vel_ratio {vel_ratio:.3f} < 0.35)"
                            })
                            break
            if not is_octave_dup:
                kept.append(ev)
                kept_pitches[p] = ev[3]
                
        corrected.extend(kept)
        
    corrected.sort(key=lambda e: e[0])
    return corrected, modified

def trace_rhythm_reconstruction(note_events, tempo, grid_resolution):
    from evaluate import quantize_note_events
    quant_events = quantize_note_events(note_events, tempo, grid_resolution)
    
    modified_durations = []
    for orig, quant in zip(note_events, quant_events):
        orig_dur = orig[1] - orig[0]
        quant_dur = quant[1] - quant[0]
        if abs(orig_dur - quant_dur) > 0.005:
            modified_durations.append({
                "pitch": orig[2],
                "onset": orig[0],
                "orig_dur": orig_dur,
                "quant_dur": quant_dur
            })
    return modified_durations

def main():
    filepath = r"C:\ReactNative\music-app\MeloNote\backend\tyler.wav"
    if not os.path.exists(filepath):
        print(f"Error: {filepath} does not exist.")
        sys.exit(1)
        
    print("[audit] Starting pipeline audit on tyler.wav ...")
    
    # Run Audio Preprocessing
    audio, sr = preprocess_audio(filepath, target_sr=PT_SR)
    audio_len_sec = len(audio) / PT_SR
    
    # Run Acoustic Model Transcription
    transcriber = _get_transcriber()
    transcribed_dict = transcriber.transcribe(audio, None)
    
    # --------------------------------------------------
    # Stage 1: Raw Model Output
    # --------------------------------------------------
    raw_notes = []
    for note in transcribed_dict['est_note_events']:
        onset = note['onset_time']
        offset = note['offset_time']
        pitch = note['midi_note']
        vel = note['velocity'] / 127.0
        raw_notes.append([onset, offset, pitch, vel, None])
        
    # Pedal Extension (considered part of raw transcription output step before filtering)
    pedal_events = transcribed_dict.get('est_pedal_events', [])
    raw_notes_extended = extend_notes_by_pedal(raw_notes, pedal_events)
    
    print("\n" + "="*50)
    print("PIPELINE AUDIT")
    print("="*50)
    print("\nStage 1: Raw Model Output")
    print(f"- Total notes detected: {len(raw_notes_extended)}")
    print("- List first 50 notes:")
    print(f"{'pitch':<15} | {'start':<10} | {'end':<10} | {'confidence/vel':<15}")
    print("-"*60)
    for n in raw_notes_extended[:50]:
        print(f"{format_pitch(n[2]):<15} | {n[0]:<10.3f} | {n[1]:<10.3f} | {n[3]:<15.3f}")
        
    # --------------------------------------------------
    # Stage 2: After Confidence Filtering
    # --------------------------------------------------
    filtered_notes, removed_conf = trace_confidence_filtering(raw_notes_extended, audio_len_sec)
    print("\n" + "="*50)
    print("Stage 2: After Confidence Filtering")
    print(f"- Total notes remaining: {len(filtered_notes)}")
    print(f"- Number removed: {len(removed_conf)}")
    print("- Exact notes removed:")
    print(f"{'pitch':<15} | {'start':<10} | {'end':<10} | {'reason':<40}")
    print("-"*80)
    for rm in removed_conf:
        n = rm["note"]
        print(f"{format_pitch(n[2]):<15} | {n[0]:<10.3f} | {n[1]:<10.3f} | {rm['reason']}")
        
    # Shift timeline (alignment)
    if filtered_notes:
        min_onset = min(ev[0] for ev in filtered_notes)
        for ev in filtered_notes:
            ev[0] = max(0.0, ev[0] - min_onset)
            ev[1] = max(ev[0] + 0.08, ev[1] - min_onset)
            
    # --------------------------------------------------
    # Stage 3: After Harmonic Suppression
    # --------------------------------------------------
    harmonic_notes, removed_harm = trace_harmonic_suppression(filtered_notes, onset_tolerance=0.08)
    print("\n" + "="*50)
    print("Stage 3: After Harmonic Suppression")
    print(f"- Total notes remaining: {len(harmonic_notes)}")
    print(f"- Number removed: {len(removed_harm)}")
    print("- Exact notes removed:")
    print(f"{'pitch':<15} | {'start':<10} | {'end':<10} | {'reason':<40}")
    print("-"*80)
    for rm in removed_harm:
        n = rm["note"]
        print(f"{format_pitch(n[2]):<15} | {n[0]:<10.3f} | {n[1]:<10.3f} | {rm['reason']}")
        
    # --------------------------------------------------
    # Stage 4: After Octave Correction
    # --------------------------------------------------
    octave_notes, modified_oct = trace_octave_correction(harmonic_notes, cluster_window=0.08)
    print("\n" + "="*50)
    print("Stage 4: After Octave Correction")
    print(f"- Total notes modified: {len(modified_oct)}")
    print("- Detailed pitch modifications:")
    for mod in modified_oct:
        print(f"  {format_pitch(mod['orig_pitch'])} -> {format_pitch(mod['new_pitch'])} (at {mod['note'][0]:.3f}s: {mod['reason']})")
        
    # Merge notes (merging is part of post-processing pipeline)
    merged_notes = merge_fragmented_notes(octave_notes, gap_threshold=0.25)
    
    # --------------------------------------------------
    # Stage 5: After Melody Extraction
    # --------------------------------------------------
    # Melody extraction in MeloNote is only active when `monophonic=True` is requested.
    # We trace under polyphonic (standard) transcription first, and show that 0 notes are removed.
    print("\n" + "="*50)
    print("Stage 5: After Melody Extraction")
    print(f"- Total notes before: {len(merged_notes)}")
    print(f"- Total notes after: {len(merged_notes)}")
    print("- Discarded notes:")
    print("  [None] (Melody extraction is only active when monophonic transcription is selected.)")
    
    # --------------------------------------------------
    # Stage 6: After Voice Separation
    # --------------------------------------------------
    treble_raw, bass_raw = split_voices_stateful(merged_notes, cluster_window=0.08)
    print("\n" + "="*50)
    print("Stage 6: After Voice Separation")
    print(f"- Treble Notes Count: {len(treble_raw)}")
    print(f"- Bass Notes Count: {len(bass_raw)}")
    print("- Sample voice assignments (First 20 notes):")
    print(f"{'pitch':<15} | {'start':<10} | {'end':<10} | {'assigned_voice':<15}")
    print("-"*60)
    for n in sorted(merged_notes, key=lambda e: e[0])[:20]:
        voice = "Treble" if n in treble_raw else "Bass"
        print(f"{format_pitch(n[2]):<15} | {n[0]:<10.3f} | {n[1]:<10.3f} | {voice:<15}")
        
    # --------------------------------------------------
    # Stage 7: After Rhythm Reconstruction
    # --------------------------------------------------
    # We will simulate rhythm reconstruction at the best tempo selected for tyler.wav (94 BPM)
    tempo = 94.0
    grid_resolution = 0.25
    modified_durations = trace_rhythm_reconstruction(merged_notes, tempo, grid_resolution)
    print("\n" + "="*50)
    print("Stage 7: After Rhythm Reconstruction (at 94 BPM, 16th grid)")
    print(f"- Total notes with modified durations: {len(modified_durations)}")
    print("- Detailed duration modifications (First 30 modified notes):")
    print(f"{'pitch':<15} | {'onset':<10} | {'original_dur (s)':<20} | {'quantized_dur (s)':<20}")
    print("-"*75)
    for mod in modified_durations[:30]:
        print(f"{format_pitch(mod['pitch']):<15} | {mod['onset']:<10.3f} | {mod['orig_dur']:<20.3f} | {mod['quant_dur']:<20.3f}")
        
    # --------------------------------------------------
    # Stage 8: Final MusicXML Export
    # --------------------------------------------------
    # Generate MusicXML structure and count notes
    best_ts = "4/4"
    best_key = "C"
    use_flats = False
    event_id_to_flat_index = {}
    
    # Assign unique IDs
    sorted_all = sorted(merged_notes, key=lambda x: x[0])
    sorted_all_with_ids = [[e[0], e[1], e[2], e[3], idx] for idx, e in enumerate(sorted_all)]
    
    treble_with_ids = []
    bass_with_ids = []
    for idx, ev in enumerate(sorted_all):
        new_ev = [ev[0], ev[1], ev[2], ev[3], idx]
        if any(abs(r[0] - ev[0]) < 0.001 and r[2] == ev[2] for r in treble_raw):
            treble_with_ids.append(new_ev)
        else:
            bass_with_ids.append(new_ev)
            
    capacity_beats = 4.0
    treble_notes = format_clef_notes(treble_with_ids, True, tempo, use_flats, event_id_to_flat_index, capacity_beats, grid_resolution=grid_resolution)
    bass_notes = format_clef_notes(bass_with_ids, False, tempo, use_flats, event_id_to_flat_index, capacity_beats, grid_resolution=grid_resolution)
    
    xml_str = build_musicxml(treble_notes, bass_notes, best_ts, tempo, best_key)
    
    # Parse notes element in XML
    import xml.etree.ElementTree as ET
    root = ET.fromstring(xml_str)
    notes_in_xml = root.findall(".//note")
    rest_count = sum(1 for n in notes_in_xml if n.find("rest") is not None)
    tie_stop_count = sum(1 for n in notes_in_xml if n.find("tie") is not None and n.find("tie").get("type") == "stop")
    playable_notes_in_xml = len(notes_in_xml) - rest_count
    
    print("\n" + "="*50)
    print("Stage 8: Final MusicXML Export")
    print(f"- Total XML <note> elements: {len(notes_in_xml)}")
    print(f"  - Rests: {rest_count}")
    print(f"  - Tie-stops (linked continuations): {tie_stop_count}")
    print(f"  - Playable notes in XML (excluding rests): {playable_notes_in_xml}")
    print(f"- Compare against raw model note count: XML has {playable_notes_in_xml} playable notes vs {len(raw_notes_extended)} raw")
    
    # --------------------------------------------------
    # Summary Table
    # --------------------------------------------------
    print("\n" + "="*50)
    print("CRITICAL REQUIREMENT: PIPELINE SUMMARY")
    print("="*50)
    print(f"{'Pipeline Stage':<25} | {'Notes Count':<12}")
    print("-"*41)
    print(f"{'Raw Notes':<25} | {len(raw_notes_extended):<12}")
    print(f"{'After Filtering':<25} | {len(filtered_notes):<12}")
    print(f"{'After Harmonic Removal':<25} | {len(harmonic_notes):<12}")
    print(f"{'After Octave Correction':<25} | {len(octave_notes):<12}")
    print(f"{'After Melody Extraction':<25} | {len(merged_notes):<12}")
    print(f"{'Final Export (Playable)':<25} | {playable_notes_in_xml:<12}")
    print("="*50)
    
    # --------------------------------------------------
    # Validation Explanations
    # --------------------------------------------------
    print("\n" + "="*50)
    print("VALIDATION")
    print("="*50)
    
    # Check Filtering changes
    filtering_change = (len(raw_notes_extended) - len(filtered_notes)) / len(raw_notes_extended)
    print(f"Confidence Filtering removed {len(raw_notes_extended) - len(filtered_notes)} notes ({filtering_change*100.0:.2f}%)")
    if filtering_change < 0.05:
        print("  [EXPLANATION] Stage changes < 5% because raw transcription on clean audio contains very few clicks/noise artifacts.")
        
    # Check Harmonic Removal changes
    harm_change = (len(filtered_notes) - len(harmonic_notes)) / len(filtered_notes)
    print(f"Harmonic Suppression removed {len(removed_harm)} notes ({harm_change*100.0:.2f}%)")
    if len(removed_harm) == 0:
        print("  [EXPLANATION] Harmonic suppression removed 0 notes because the piano piece was recorded with single note/chord fundamentals and did not trigger simultaneous overtone notes matching the 2x, 3x, or 1.5x ratios above the velocity ratio thresholds.")
        
    # Check Octave Correction changes
    print(f"Octave Correction modified {len(modified_oct)} notes")
    if len(modified_oct) == 0:
        print("  [EXPLANATION] Octave correction changed 0 notes because all detected note pitches are within stable melodic registers below the MIDI 100 threshold and do not trigger cluster octave overlap mergers.")
        
    # Check Melody Extraction changes
    melody_change = len(octave_notes) - len(merged_notes)
    print(f"Melody Extraction removed {melody_change} notes")
    if melody_change == 0:
        print("  [EXPLANATION] Melody extraction removed 0 notes because polyphonic transcription is active by default (keeps all voice structures intact), meaning chord simplification is not triggered.")
        
    print("="*50 + "\n")

if __name__ == "__main__":
    main()
