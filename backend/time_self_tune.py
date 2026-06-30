# time_self_tune.py -- Quick benchmark of the self_tune loop timing
import time, librosa, numpy as np
import warnings; warnings.filterwarnings("ignore")
from piano_transcription_inference import sample_rate as PT_SR

print("Loading audio (full tyler.wav)...")
audio, sr = librosa.load("tyler.wav", sr=PT_SR, mono=True)
print(f"Audio length: {len(audio)/sr:.1f}s")

print("Transcribing...")
t0 = time.time()
from analyze import _get_transcriber, extend_notes_by_pedal, correct_octaves
transcriber = _get_transcriber()
res = transcriber.transcribe(audio, None)
t1 = time.time()
print(f"Transcription: {t1-t0:.1f}s")

raw = []
for n in res['est_note_events']:
    onset, offset, pitch, vel = n['onset_time'], n['offset_time'], n['midi_note'], n['velocity']/127.0
    if offset - onset < 0.08: offset = onset + 0.08
    raw.append([onset, offset, pitch, vel, None])
raw = extend_notes_by_pedal(raw, res.get('est_pedal_events', []))
raw = correct_octaves(raw)

lb_tempo, _ = librosa.beat.beat_track(y=audio, sr=PT_SR)
lb_tempo = float(lb_tempo[0] if hasattr(lb_tempo, '__len__') else lb_tempo)
print(f"librosa tempo: {lb_tempo:.1f} BPM, Notes: {len(raw)}")

print("Running self_tune...")
t2 = time.time()
from self_tune import self_tune, get_tempo_candidates
cands = get_tempo_candidates(raw, audio, PT_SR, lb_tempo)
print(f"Candidates: {cands}")
best_events, best_tempo, best_params, scores = self_tune(
    audio, PT_SR, raw, cands, lb_tempo=lb_tempo, verbose=True
)
t3 = time.time()
print(f"\nSelf-tune: {t3-t2:.1f}s")
print(f"Total pipeline: {t3-t0:.1f}s")
print(f"Selected tempo: {best_tempo} BPM")
print(f"Quality: {scores.get('overall_score')}")
