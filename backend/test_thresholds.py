# test_thresholds.py
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

import analyze

def test_combination(onset, frame, min_len):
    print(f"Testing: onset={onset}, frame={frame}, min_len={min_len}")
    # Temporarily monkeypatch predict in analyze
    orig_predict = analyze.predict
    def mock_predict(*args, **kwargs):
        kwargs['onset_threshold'] = onset
        kwargs['frame_threshold'] = frame
        kwargs['minimum_note_length'] = min_len
        return orig_predict(*args, **kwargs)
    
    analyze.predict = mock_predict
    try:
        res = analyze.analyze_audio("tyler.wav")
        notes = res["notes"]
        treble = res["treble_notes"]
        bass = res["bass_notes"]
        non_rest_notes = [n for n in notes if n["pitch"] != "rest"]
        print(f"  Result -> Total Notes: {len(notes)}, Non-Rest: {len(non_rest_notes)}, Treble: {len(treble)}, Bass: {len(bass)}")
    except Exception as e:
        print("  Error:", e)
    finally:
        analyze.predict = orig_predict

if __name__ == "__main__":
    combinations = [
        (0.4, 0.2, 70.0),
        (0.5, 0.3, 100.0),
        (0.5, 0.3, 80.0),
        (0.45, 0.25, 90.0),
        (0.55, 0.35, 110.0),
        (0.5, 0.4, 100.0),
    ]
    for onset, frame, min_len in combinations:
        test_combination(onset, frame, min_len)
