# -*- coding: utf-8 -*-
# test_reduction_engine.py - Verification tests for Musical Reduction Engine

import sys
import os
import numpy as np

backend_path = r"C:\ReactNative\music-app\MeloNote\backend"
if backend_path not in sys.path:
    sys.path.append(backend_path)

from analyze import musical_reduction_engine, calculate_ab_metrics

def test_chord_validation():
    print("\n--- Test Case: Chord Validation (5+ notes mixed confidence) ---")
    # A 6-note chord with mixed confidence (velocity):
    # C4(60, vel=0.7), E4(64, vel=0.2), G4(67, vel=0.8), Bb4(70, vel=0.15), C5(72, vel=0.75)
    # Bass = 60, Melody = 72, Loudest middle = 67
    note_events = [
        [0.0, 1.0, 60, 0.70, None], # Bass
        [0.01, 1.0, 64, 0.20, None], # Quiet middle
        [0.02, 1.0, 67, 0.80, None], # Loud middle
        [0.01, 1.0, 70, 0.15, None], # Quiet middle
        [0.03, 1.0, 72, 0.75, None]  # Melody
    ]
    
    reduced = musical_reduction_engine(note_events, mode="advanced", tempo=120.0)
    print(f"Original Chord Notes: {len(note_events)}")
    print(f"Reduced Chord Notes: {len(reduced)}")
    for n in reduced:
        print(f"  Note: pitch={n[2]} vel={n[3]:.2f}")
        
    # Expect: 60 (bass), 67 (loud middle), 72 (melody)
    pitches = [n[2] for n in reduced]
    assert len(reduced) <= 3, f"Expected at most 3 notes, got {len(reduced)}"
    assert 60 in pitches, "Expected bass note 60 in pitches"
    assert 72 in pitches, "Expected melody note 72 in pitches"
    assert 67 in pitches, "Expected loud middle note 67 in pitches"
    print("  [PASS] Chord Validation passed!")

def test_simplification_modes():
    print("\n--- Test Case: Simplification Modes (Beginner / Intermediate / Advanced) ---")
    # A 4-note chord: C4(60, vel=0.7), E4(64, vel=0.6), G4(67, vel=0.8), C5(72, vel=0.75)
    note_events = [
        [0.0, 1.0, 60, 0.70, None],
        [0.0, 1.0, 64, 0.60, None],
        [0.0, 1.0, 67, 0.80, None],
        [0.0, 1.0, 72, 0.75, None]
    ]
    
    # 1. Beginner Mode: Melody only
    beg_reduced = musical_reduction_engine(note_events, mode="beginner")
    print(f"Beginner (Melody only) pitches: {[n[2] for n in beg_reduced]}")
    assert len(beg_reduced) == 1, "Expected 1 note in beginner mode"
    assert beg_reduced[0][2] == 72, "Expected melody note 72 in beginner mode"
    
    # 2. Intermediate Mode: Melody + Bass
    int_reduced = musical_reduction_engine(note_events, mode="intermediate")
    print(f"Intermediate (Melody+Bass) pitches: {[n[2] for n in int_reduced]}")
    assert len(int_reduced) == 2, "Expected 2 notes in intermediate mode"
    assert int_reduced[0][2] == 60, "Expected bass note 60"
    assert int_reduced[1][2] == 72, "Expected melody note 72"
    
    # 3. Advanced Mode: Max 3 notes
    adv_reduced = musical_reduction_engine(note_events, mode="advanced")
    print(f"Advanced (Max 3 notes) pitches: {[n[2] for n in adv_reduced]}")
    assert len(adv_reduced) == 3, "Expected 3 notes in advanced mode"
    
    print("  [PASS] Simplification Modes passed!")

def test_melody_priority_pathfinding():
    print("\n--- Test Case: Melody Prioritization Graph-based Pathfinding ---")
    # We define a polyphonic piece with two lines:
    # Line 1 (Melody, stepwise A4->B4->C5->D5, duration=1.0s, high velocity=0.8)
    # Line 2 (Accompaniment, leaps G3->D4->G3->D4, duration=0.4s, low velocity=0.4)
    # We expect that enabling melody_priority will extract ONLY the Line 1 melody path.
    note_events = [
        # Line 1 (Melody)
        [0.0, 1.0, 69, 0.8, None], # A4
        [1.0, 2.0, 71, 0.8, None], # B4
        [2.0, 3.0, 72, 0.8, None], # C5
        [3.0, 4.0, 74, 0.8, None], # D5
        
        # Line 2 (Accompaniment)
        [0.0, 0.4, 55, 0.4, None], # G3
        [1.0, 1.4, 62, 0.4, None], # D4
        [2.0, 2.4, 55, 0.4, None], # G3
        [3.0, 3.4, 62, 0.4, None]  # D4
    ]
    
    reduced = musical_reduction_engine(note_events, mode="advanced", melody_priority=True, tempo=120.0)
    print(f"Melody Priority pitches: {[n[2] for n in reduced]}")
    # Should only keep the 4 melody notes
    assert len(reduced) == 4, f"Expected 4 melody notes, got {len(reduced)}"
    pitches = [n[2] for n in reduced]
    assert pitches == [69, 71, 72, 74], f"Expected path [69, 71, 72, 74], got {pitches}"
    print("  [PASS] Melody Graph Pathfinding passed!")

def test_measure_density_reduction():
    print("\n--- Test Case: Measure Density Reduction ---")
    # A single measure (4.0s at 120 BPM, capacity_beats=4.0) containing 22 notes.
    # 18 of them are quiet off-beat clicks (start at odd fractions like 0.17s, vel=0.3)
    # 4 of them are loud strong-beat notes (start at 0.0s, 1.0s, 2.0s, 3.0s, vel=0.8)
    note_events = []
    # 4 strong-beat notes
    for i in range(4):
        note_events.append([float(i), float(i) + 0.8, 60 + i, 0.8, None])
    # 18 weak-beat quiet notes
    for i in range(18):
        onset = 0.13 + (i * 0.20)
        note_events.append([onset, onset + 0.1, 72, 0.3, None])
        
    reduced = musical_reduction_engine(note_events, mode="advanced", tempo=120.0, capacity_beats=4.0)
    print(f"Original note count in bar: {len(note_events)}")
    print(f"Reduced note count in bar: {len(reduced)}")
    # Should have filtered out most of the quiet off-beat clicks
    assert len(reduced) < len(note_events), "Expected notes density to be reduced"
    pitches = [n[2] for n in reduced]
    for p in [60, 61, 62, 63]:
        assert p in pitches, f"Expected strong-beat note {p} to be preserved"
    print("  [PASS] Measure Density Reduction passed!")

def test_ab_metrics():
    print("\n--- Test Case: A/B Metrics Evaluation ---")
    version_a = [
        [0.0, 1.0, 60, 0.70, None],
        [0.0, 1.0, 64, 0.60, None],
        [0.0, 1.0, 67, 0.80, None],
        [0.0, 1.0, 72, 0.75, None]
    ]
    version_b = [
        [0.0, 1.0, 60, 0.70, None],
        [0.0, 1.0, 72, 0.75, None]
    ]
    
    metrics = calculate_ab_metrics(version_a, version_b)
    print("Metrics output:")
    for k, v in metrics.items():
        print(f"  {k}: {v}")
        
    assert metrics["version_a"]["note_count"] == 4
    assert metrics["version_b"]["note_count"] == 2
    assert metrics["metrics_comparison"]["notes_removed"] == 2
    print("  [PASS] A/B Metrics Evaluation passed!")

def main():
    test_chord_validation()
    test_simplification_modes()
    test_melody_priority_pathfinding()
    test_measure_density_reduction()
    test_ab_metrics()
    print("\n==============================")
    print("ALL REDUCTION TESTS PASSED!")
    print("==============================")

if __name__ == "__main__":
    main()
