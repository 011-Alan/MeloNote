# print_raw_notes.py
import sys
import os

# Suppress TF C++ logs
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
    from basic_pitch.inference import predict
finally:
    sys.stderr = old_stderr

import numpy as np

def run():
    model_output, midi_data, note_events = predict(
        "tyler.wav",
        onset_threshold=0.5,
        frame_threshold=0.3,
        minimum_note_length=100.0
    )
    
    print(f"Detected {len(note_events)} note events:")
    # sort by start time
    sorted_events = sorted(note_events, key=lambda x: x[0])
    for idx, event in enumerate(sorted_events):
        start, end, pitch, velocity, pitch_bend = event[0], event[1], event[2], event[3], event[4]
        # midi to note name
        NOTES_SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        note_name = NOTES_SHARPS[pitch % 12] + str((pitch // 12) - 1)
        duration = end - start
        print(f"[{idx}] pitch={pitch} ({note_name}), start={start:.3f}s, end={end:.3f}s, dur={duration:.3f}s")

if __name__ == "__main__":
    run()
