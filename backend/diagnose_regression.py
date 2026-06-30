# diagnose_regression.py
# PHASE 1: Regression analysis - measure exact impact of tempo on sheet music quality
import sys, os, copy, numpy as np, librosa
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
import warnings; warnings.filterwarnings("ignore")

from analyze import (_get_transcriber, correct_octaves, suppress_harmonics,
                     merge_fragmented_notes, extend_notes_by_pedal,
                     estimate_tempo_from_onsets, format_clef_notes,
                     detect_time_signature, split_voices_stateful)

# ── Load and transcribe once ─────────────────────────────────────────────────
print("=== PHASE 1: REGRESSION ANALYSIS ===\n")
from piano_transcription_inference import sample_rate as PT_SR
filepath = "tyler.wav"
audio, sr = librosa.load(filepath, sr=PT_SR, mono=True)
audio = audio[:PT_SR * 30]

print("Transcribing with ByteDance model...")
transcriber = _get_transcriber()
res = transcriber.transcribe(audio, None)

raw = []
for n in res['est_note_events']:
    onset, offset, pitch, vel = n['onset_time'], n['offset_time'], n['midi_note'], n['velocity']/127.0
    if offset - onset < 0.08: offset = onset + 0.08
    raw.append([onset, offset, pitch, vel, None])

pedal_events = res.get('est_pedal_events', [])
raw = extend_notes_by_pedal(raw, pedal_events)
raw = correct_octaves(raw)

try:
    lb_tempo, _ = librosa.beat.beat_track(y=audio, sr=PT_SR)
    lb_tempo = float(lb_tempo[0] if hasattr(lb_tempo, '__len__') else lb_tempo)
except: lb_tempo = 120.0

print(f"librosa beat_track: {lb_tempo:.1f} BPM")
print(f"Raw note events: {len(raw)}")

# ── Musical quality scorer ───────────────────────────────────────────────────
def score_tempo_musically(note_events, tempo, gap_threshold=0.35):
    """Score a tempo candidate using musical structure quality."""
    if tempo <= 0: return -999.0

    events = suppress_harmonics(note_events)
    events = merge_fragmented_notes(events, gap_threshold=gap_threshold)
    beat_dur = 60.0 / tempo

    # 1. Beat alignment score: what fraction of onsets land near a beat
    onsets = sorted(e[0] for e in events)
    grid_step = beat_dur / 4  # 16th note grid
    alignment_errors = []
    for o in onsets:
        grid_pos = round(o / grid_step)
        err = abs(o - grid_pos * grid_step)
        alignment_errors.append(err / beat_dur)
    alignment_score = max(0, 1.0 - np.mean(alignment_errors) * 4) if alignment_errors else 0

    # 2. Measure fill score: how well notes fill measures
    ts = detect_time_signature(events, tempo)
    ts_parts = ts.split('/')
    cap_beats = (int(ts_parts[0]) / int(ts_parts[1])) * 4.0
    measure_dur = cap_beats * beat_dur
    if measure_dur <= 0: return alignment_score

    # Count measure boundaries crossed by note onsets
    total_dur = max(e[1] for e in events) if events else 1.0
    num_measures = max(1, int(total_dur / measure_dur))
    notes_per_measure = []
    for m in range(num_measures):
        m_start = m * measure_dur
        m_end = (m + 1) * measure_dur
        count = sum(1 for e in events if m_start <= e[0] < m_end)
        notes_per_measure.append(count)
    # Good transcriptions have 1-6 notes per measure, not 0 or 20
    ideal_notes = 3.0
    measure_score = np.mean([max(0, 1.0 - abs(n - ideal_notes) / (ideal_notes + 2))
                              for n in notes_per_measure if n > 0]) if notes_per_measure else 0

    # 3. Note duration naturalness: durations should be near musical values
    beat_fracs = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0]
    natural_count = 0
    for ev in events:
        dur_beats = (ev[1] - ev[0]) / beat_dur
        if any(abs(dur_beats/frac - 1.0) < 0.25 for frac in beat_fracs):
            natural_count += 1
    duration_score = natural_count / max(len(events), 1)

    # 4. Note count reasonableness (30s clip: 10-60 notes is reasonable)
    count_score = 1.0 if 10 <= len(events) <= 60 else max(0, 1.0 - abs(len(events) - 35) / 35)

    # Combined
    total = (alignment_score * 0.35 + measure_score * 0.30 +
             duration_score * 0.25 + count_score * 0.10)
    return total, alignment_score, measure_score, duration_score, len(events), ts

# ── Test ALL tempo candidates ────────────────────────────────────────────────
from self_tune import get_tempo_candidates
tempo_cands = get_tempo_candidates(raw, audio, PT_SR, lb_tempo)
print(f"\nAll tempo candidates: {tempo_cands}")
print("\n{'Tempo':>6} | {'Align':>6} | {'Measure':>7} | {'Dur':>6} | {'Notes':>5} | {'TS':>5} | {'TOTAL':>6}")
print("-" * 60)

results = []
for t in sorted(set(tempo_cands + [47, 91, 94, 96, 188])):
    try:
        total, align, meas, dur, cnt, ts = score_tempo_musically(copy.deepcopy(raw), t)
        results.append((t, total, align, meas, dur, cnt, ts))
        print(f"{t:>6} | {align:>6.3f} | {meas:>7.3f} | {dur:>6.3f} | {cnt:>5} | {ts:>5} | {total:>6.3f}")
    except Exception as e:
        print(f"{t:>6} | ERROR: {e}")

best = max(results, key=lambda x: x[1])
print(f"\nBEST TEMPO BY MUSICAL QUALITY: {best[0]} BPM (score={best[1]:.4f})")
current = 188
curr_row = next((r for r in results if r[0] == current), None)
if curr_row:
    print(f"CURRENT SELECTED: {current} BPM (score={curr_row[1]:.4f})")
    print(f"DELTA: {best[1] - curr_row[1]:+.4f}")
