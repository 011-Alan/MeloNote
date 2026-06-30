# test_stages.py
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
    import librosa
    import numpy as np
    import torch
    from piano_transcription_inference import PianoTranscription, sample_rate as PT_SR
finally:
    sys.stderr = old_stderr

def test_pipeline():
    filepath = "tyler.wav"
    
    # 1. ByteDance Detections
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    transcriber = PianoTranscription(device=device)
    
    audio, sr = librosa.load(filepath, sr=PT_SR, mono=True)
    transcribed_dict = transcriber.transcribe(audio, None)
    
    note_events = []
    for note in transcribed_dict['est_note_events']:
        onset  = note['onset_time']
        offset = note['offset_time']
        pitch  = note['midi_note']
        vel    = note['velocity'] / 127.0
        if offset - onset < 0.08:
            offset = onset + 0.08
        note_events.append([onset, offset, pitch, vel, None])
    
    print(f"Raw Note Events: {len(note_events)}")
    
    # 2. Librosa Onset Detection
    onset_frames = librosa.onset.onset_detect(y=audio, sr=PT_SR, backtrack=True)
    onset_times = librosa.frames_to_time(onset_frames, sr=PT_SR)
    print(f"Detected Librosa Onsets: {len(onset_times)}")
    print(f"First 10 Onset Times: {onset_times[:10]}")
    
    # 3. Align Note Starts to Onsets
    aligned_events = []
    aligned_count = 0
    for start, end, pitch, amp, pb in note_events:
        # Find closest onset
        if len(onset_times) > 0:
            diffs = np.abs(onset_times - start)
            closest_idx = np.argmin(diffs)
            closest_time = onset_times[closest_idx]
            # If the closest onset is within 70ms, snap to it!
            if diffs[closest_idx] < 0.07:
                start = closest_time
                aligned_count += 1
        aligned_events.append([start, end, pitch, amp, pb])
        
    print(f"Aligned {aligned_count} note starts to Librosa onset peaks.")
    
    # 4. Analyze Chord Density
    # Let's see how many notes have chords larger than 3 notes
    # We can cluster aligned_events
    aligned_events.sort(key=lambda x: x[0])
    clusters = []
    cluster_threshold = 0.08
    for ev in aligned_events:
        if not clusters or ev[0] - clusters[-1][0][0] >= cluster_threshold:
            clusters.append([ev])
        else:
            clusters[-1].append(ev)
            
    chord_sizes = [len(c) for c in clusters]
    print(f"Total Clusters: {len(clusters)}")
    print(f"Max Chord Size: {max(chord_sizes) if chord_sizes else 0}")
    print(f"Average Chord Size: {sum(chord_sizes)/len(chord_sizes):.2f}")
    
    # 5. Simplify Chords (Stage 4)
    # For each cluster, keep top N notes based on amplitude (amp)
    simplified_count = 0
    MAX_TREBLE_NOTES = 3
    MAX_BASS_NOTES = 2
    
    for c_idx, cluster in enumerate(clusters[:10]):
        print(f"Cluster {c_idx} (start={cluster[0][0]:.3f}s):")
        # Split into treble/bass
        treble = [n for n in cluster if n[2] >= 60]
        bass = [n for n in cluster if n[2] < 60]
        
        # Sort by amplitude (descending)
        treble.sort(key=lambda x: x[3], reverse=True)
        bass.sort(key=lambda x: x[3], reverse=True)
        
        print(f"  Treble notes count before: {len(treble)}, Bass: {len(bass)}")
        # Keep top N
        treble_kept = treble[:MAX_TREBLE_NOTES]
        bass_kept = bass[:MAX_BASS_NOTES]
        print(f"  Treble kept: {[t[2] for t in treble_kept]}, Bass kept: {[b[2] for b in bass_kept]}")

if __name__ == "__main__":
    test_pipeline()
