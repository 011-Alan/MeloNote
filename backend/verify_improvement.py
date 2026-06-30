# verify_improvement.py -- Measure before/after self-tuning improvements
import sys
import os
import numpy as np
import librosa
from analyze import _get_transcriber, correct_octaves, suppress_harmonics, merge_fragmented_notes, estimate_tempo_from_onsets
from evaluate import evaluate_round_trip, quick_chroma_score
from self_tune import self_tune, get_tempo_candidates

def run_comparison():
    print("Loading audio file (tyler.wav)...")
    filepath = "tyler.wav"
    audio, sr = librosa.load(filepath, sr=16000, mono=True)
    audio = audio[:16000 * 30] # first 30 seconds for speed

    # 1. Acoustic model transcription
    print("Running ByteDance transcriber...")
    transcriber = _get_transcriber()
    res = transcriber.transcribe(audio, None)
    
    raw_events = []
    for note in res['est_note_events']:
        onset = note['onset_time']
        offset = note['offset_time']
        pitch = note['midi_note']
        vel = note['velocity'] / 127.0
        if offset - onset < 0.08:
            offset = onset + 0.08
        raw_events.append([onset, offset, pitch, vel, None])
    
    raw_events = correct_octaves(raw_events)

    # Calculate fallback tempo
    try:
        lb_tempo, _ = librosa.beat.beat_track(y=audio, sr=16000)
        lb_tempo = float(lb_tempo) if not isinstance(lb_tempo, np.ndarray) else float(lb_tempo[0])
    except Exception:
        lb_tempo = 120.0

    # ----------------------------------------------------
    # BEFORE (Static Parameters)
    # ----------------------------------------------------
    print("\n--- Evaluating Before (Static Pipeline) ---")
    static_gap = 0.35
    static_grid = 0.25
    static_events = suppress_harmonics(raw_events, onset_tolerance=0.08)
    static_events = merge_fragmented_notes(static_events, gap_threshold=static_gap)
    static_tempo = estimate_tempo_from_onsets(static_events, audio=audio, sr=16000, fallback_tempo=lb_tempo)
    
    scores_before = evaluate_round_trip(audio, 16000, static_events, static_tempo, grid_resolution=static_grid)
    
    # ----------------------------------------------------
    # AFTER (Self-Tuned Parameters)
    # ----------------------------------------------------
    print("\n--- Evaluating After (Self-Tuned Pipeline) ---")
    tempo_candidates = get_tempo_candidates(raw_events, audio, 16000, lb_tempo)
    tuned_events, tuned_tempo, best_params, scores_after = self_tune(
        audio, 16000, raw_events, tempo_candidates, verbose=True
    )
    
    # ----------------------------------------------------
    # DISPLAY COMPARISON
    # ----------------------------------------------------
    print("\n" + "="*50)
    print("             TRANSCRIPTION QUALITY COMPARISON")
    print("="*50)
    print(f"Metric              | Before (Static) | After (Self-Tuned)")
    print(f"--------------------+-----------------+-------------------")
    print(f"Tempo (BPM)         | {static_tempo:15d} | {tuned_tempo:17d}")
    print(f"Merge Gap (sec)     | {static_gap:15.2f} | {best_params['gap_threshold']:17.2f}")
    print(f"Quantization Grid   | {static_grid:15.2f} | {best_params['grid_resolution']:17.2f}")
    print(f"--------------------+-----------------+-------------------")
    print(f"Chroma Similarity   | {scores_before['chroma_similarity']:15.4f} | {scores_after['chroma_similarity']:17.4f}")
    print(f"Pitch Accuracy      | {scores_before['pitch_accuracy']:15.4f} | {scores_after['pitch_accuracy']:17.4f}")
    print(f"Rhythm Accuracy     | {scores_before['rhythm_accuracy']:15.4f} | {scores_after['rhythm_accuracy']:17.4f}")
    print(f"Tempo Consistency   | {scores_before['tempo_accuracy']:15.4f} | {scores_after['tempo_accuracy']:17.4f}")
    print(f"--------------------+-----------------+-------------------")
    print(f"OVERALL QUALITY     | {scores_before['overall_score']:15.4f} | {scores_after['overall_score']:17.4f}")
    print("="*50)
    
    diff = scores_after['overall_score'] - scores_before['overall_score']
    print(f"Improvement in Overall Score: +{diff*100:.2f}%")
    print("="*50)

if __name__ == "__main__":
    run_comparison()
