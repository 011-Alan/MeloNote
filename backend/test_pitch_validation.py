# -*- coding: utf-8 -*-
# test_pitch_validation.py - Verification tests for MeloNote Pitch Validation Engine

import sys
import os

backend_path = r"C:\ReactNative\music-app\MeloNote\backend"
if backend_path not in sys.path:
    sys.path.append(backend_path)

from analyze import run_pitch_validation_engine, midi_to_note_name

def test_example_1():
    print("\n--- Test Case 1: Bb1, Bb2, F3, F4, D5 cluster ---")
    # Inputs: Bb1(0.70), Bb2(0.35), F3(0.50), F4(0.20), D5(0.75)
    # MIDI: Bb1=34, Bb2=46, F3=53, F4=65, D5=74
    note_events = [
        [0.0, 1.0, 34, 0.70, None],
        [0.01, 1.0, 46, 0.35, None],
        [0.02, 1.0, 53, 0.50, None],
        [0.01, 1.0, 65, 0.20, None],
        [0.03, 1.0, 74, 0.75, None]
    ]
    
    validated = run_pitch_validation_engine(note_events)
    validated_pitches = [n[2] for n in validated]
    print(f"Validated pitches: {validated_pitches} ({[midi_to_note_name(p) for p in validated_pitches]})")
    
    # Expected to keep Bb1(34), F3(53), D5(74)
    # Expected to discard Bb2(46), F4(65)
    assert 34 in validated_pitches, "Expected Bb1 (34) to be kept"
    assert 53 in validated_pitches, "Expected F3 (53) to be kept"
    assert 74 in validated_pitches, "Expected D5 (74) to be kept"
    assert 46 not in validated_pitches, "Expected Bb2 (46) to be discarded"
    assert 65 not in validated_pitches, "Expected F4 (65) to be discarded"
    print("  [PASS] Test Case 1 passed!")

def test_example_2():
    print("\n--- Test Case 2: D1, D2, Gb3 cluster ---")
    # Inputs: D1(0.80), D2(0.25), Gb3(0.20)
    # MIDI: D1=26, D2=38, Gb3=54
    note_events = [
        [0.0, 1.0, 26, 0.80, None],
        [0.01, 1.0, 38, 0.25, None],
        [0.02, 1.0, 54, 0.20, None]
    ]
    
    validated = run_pitch_validation_engine(note_events)
    validated_pitches = [n[2] for n in validated]
    print(f"Validated pitches: {validated_pitches} ({[midi_to_note_name(p) for p in validated_pitches]})")
    
    # Expected to keep D1(26)
    # Expected to discard D2(38), Gb3(54)
    assert 26 in validated_pitches, "Expected D1 (26) to be kept"
    assert 38 not in validated_pitches, "Expected D2 (38) to be discarded"
    assert 54 not in validated_pitches, "Expected Gb3 (54) to be discarded"
    print("  [PASS] Test Case 2 passed!")

def test_example_3():
    print("\n--- Test Case 3: C2, C3 bass octave pair ---")
    # Inputs: C2(0.70), C3(0.30)
    # MIDI: C2=36, C3=48
    note_events = [
        [0.0, 1.0, 36, 0.70, None],
        [0.01, 1.0, 48, 0.30, None]
    ]
    
    validated = run_pitch_validation_engine(note_events)
    validated_pitches = [n[2] for n in validated]
    print(f"Validated pitches: {validated_pitches} ({[midi_to_note_name(p) for p in validated_pitches]})")
    
    # Expected to keep C2(36)
    # Expected to discard C3(48)
    assert 36 in validated_pitches, "Expected C2 (36) to be kept"
    assert 48 not in validated_pitches, "Expected C3 (48) to be discarded"
    print("  [PASS] Test Case 3 passed!")

def test_melody_safeguard():
    print("\n--- Test Case 4: Melody Safeguard ---")
    # Let's say a melody note is F5(77) with velocity 0.75, but has high harmonic score or octave ghost suspicion.
    # It starts at the same time as fundamental F3(53, vel=0.8).
    # Interval is +24 semitones (4x harmonic, 2 octaves).
    # Since velocity is 0.75 (exceeds 0.70 safeguard) and it is the highest pitch in cluster (F5 > F3), it should be kept.
    note_events = [
        [0.0, 1.0, 53, 0.80, None], # F3
        [0.0, 1.0, 77, 0.75, None]  # F5
    ]
    
    validated = run_pitch_validation_engine(note_events)
    validated_pitches = [n[2] for n in validated]
    print(f"Validated pitches: {validated_pitches} ({[midi_to_note_name(p) for p in validated_pitches]})")
    
    assert 53 in validated_pitches, "Expected fundamental F3 to be kept"
    assert 77 in validated_pitches, "Expected melody note F5 to be kept due to melody safeguard"
    print("  [PASS] Test Case 4 (Melody Safeguard) passed!")

def main():
    test_example_1()
    test_example_2()
    test_example_3()
    test_melody_safeguard()
    print("\n===============================")
    print("ALL PITCH VALIDATION TESTS PASSED!")
    print("===============================")

if __name__ == "__main__":
    main()
