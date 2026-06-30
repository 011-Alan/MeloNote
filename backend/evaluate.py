# evaluate.py — Round-Trip Evaluation Engine for MeloNote
#
# Pipeline:
#   Original Audio
#     → Transcription (note events)
#       → Synthesize piano audio from note events
#         → Compare chromagrams (original vs synthesized)
#           → Quality scores: Pitch, Rhythm, Tempo, Chroma, Overall

import numpy as np
import math


# ─────────────────────────────────────────────────────────────
# PIANO AUDIO SYNTHESIZER
# ─────────────────────────────────────────────────────────────

def midi_to_hz(midi: int) -> float:
    """Convert MIDI note number to frequency in Hz."""
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def synthesize_piano_note(freq: float, duration: float, sr: int,
                          velocity: float = 0.7) -> np.ndarray:
    """
    Generate a realistic piano-like note using:
    - 4 harmonic partials with piano amplitude ratios
    - ADSR envelope (attack, decay, sustain, release)
    - Exponential decay envelope (simulates string damping)
    """
    n_samples = int(sr * duration)
    if n_samples <= 0:
        return np.zeros(0, dtype=np.float32)

    t = np.linspace(0, duration, n_samples, endpoint=False)

    # Piano harmonic amplitudes (fundamental + overtones)
    signal = (
        velocity * 0.55 * np.sin(2 * np.pi * freq * t) +
        velocity * 0.25 * np.sin(2 * np.pi * 2 * freq * t) +
        velocity * 0.12 * np.sin(2 * np.pi * 3 * freq * t) +
        velocity * 0.05 * np.sin(2 * np.pi * 4 * freq * t) +
        velocity * 0.03 * np.sin(2 * np.pi * 5 * freq * t)
    )

    # ADSR envelope
    attack_s  = min(0.012, duration * 0.05)
    decay_s   = min(0.060, duration * 0.15)
    release_s = min(0.120, duration * 0.20)

    attack_n  = int(attack_s  * sr)
    decay_n   = int(decay_s   * sr)
    release_n = int(release_s * sr)
    sustain_n = max(0, n_samples - attack_n - decay_n - release_n)
    sustain_level = 0.65

    env_parts = []
    if attack_n  > 0: env_parts.append(np.linspace(0.0, 1.0, attack_n))
    if decay_n   > 0: env_parts.append(np.linspace(1.0, sustain_level, decay_n))
    if sustain_n > 0: env_parts.append(np.full(sustain_n, sustain_level))
    if release_n > 0: env_parts.append(np.linspace(sustain_level, 0.0, release_n))

    if env_parts:
        env = np.concatenate(env_parts)
        # Trim or pad to exact length
        if len(env) > n_samples:
            env = env[:n_samples]
        elif len(env) < n_samples:
            env = np.pad(env, (0, n_samples - len(env)))
    else:
        env = np.ones(n_samples)

    # Natural piano string decay (damping)
    # Slower decay for lower notes, faster for higher notes
    decay_rate = 2.0 + (freq / 500.0)  # higher freq → faster decay
    decay_env = np.exp(-decay_rate * t / max(duration, 0.01))

    return (signal * env * decay_env).astype(np.float32)


def quantize_note_events(note_events: list, tempo: float, grid_resolution: float = 0.25) -> list:
    """
    Quantize note events to a grid at the given tempo and resolution,
    returning a new list of note events with quantized onset/offset times in seconds.
    """
    if tempo <= 0:
        return note_events

    beat_duration = 60.0 / tempo
    grid_step = beat_duration * grid_resolution

    quantized_events = []
    for ev in note_events:
        onset = ev[0]
        offset = ev[1]

        onset_beat = round(onset / grid_step) * grid_resolution
        offset_beat = round(offset / grid_step) * grid_resolution
        if offset_beat <= onset_beat:
            offset_beat = onset_beat + grid_resolution

        quantized_onset = onset_beat * beat_duration
        quantized_offset = offset_beat * beat_duration

        # Keep other fields (pitch, velocity, etc.)
        new_ev = [quantized_onset, quantized_offset] + list(ev[2:])
        quantized_events.append(new_ev)

    return quantized_events


def synthesize_from_notes(note_events: list, tempo: float,
                           sr: int = 22050, grid_resolution: float = 0.25) -> np.ndarray:
    """
    Render a full piano audio signal from a list of note events.

    Args:
        note_events: List of [onset_time, offset_time, midi_pitch, velocity, ...]
        tempo: BPM (used to quantize note times to the grid)
        sr: Sample rate for the output audio
        grid_resolution: beat fraction (0.25 for 16th, 0.5 for 8th note grid)

    Returns:
        mono audio as float32 numpy array
    """
    if not note_events:
        return np.zeros(sr, dtype=np.float32)

    # Quantize note events to the tempo's grid for round-trip evaluation
    if tempo > 0:
        note_events = quantize_note_events(note_events, tempo, grid_resolution)

    # Find total duration needed
    max_end = max(ev[1] for ev in note_events)
    total_samples = int((max_end + 0.5) * sr)  # +0.5s padding

    output = np.zeros(total_samples, dtype=np.float32)

    for ev in note_events:
        onset  = ev[0]
        offset = ev[1]
        pitch  = int(ev[2])
        vel    = float(ev[3]) if len(ev) > 3 else 0.7

        # Clamp MIDI pitch to piano range
        pitch = max(21, min(108, pitch))

        freq     = midi_to_hz(pitch)
        duration = max(offset - onset, 0.08)
        velocity = max(0.1, min(1.0, vel))

        note_audio = synthesize_piano_note(freq, duration, sr, velocity)

        start_sample = int(onset * sr)
        end_sample   = start_sample + len(note_audio)

        if end_sample > len(output):
            # Extend output if note runs over
            output = np.pad(output, (0, end_sample - len(output)))

        output[start_sample:end_sample] += note_audio

    # Normalize to prevent clipping
    peak = np.max(np.abs(output))
    if peak > 0.001:
        output = output * (0.90 / peak)

    return output.astype(np.float32)


# ─────────────────────────────────────────────────────────────
# CHROMAGRAM COMPARISON
# ─────────────────────────────────────────────────────────────

def compute_chroma_similarity(audio1: np.ndarray, audio2: np.ndarray,
                               sr: int) -> float:
    """
    Compute cosine similarity between chromagrams of two audio signals.

    Chromagrams aggregate energy into 12 pitch classes, ignoring octave.
    This is robust to timbre differences between real piano and synthesized audio.

    Returns:
        Similarity score in [0.0, 1.0] where:
          1.0 = identical pitch content
          0.9 = very similar (good transcription)
          0.7 = decent
          < 0.5 = poor transcription
    """
    try:
        import librosa

        hop = 512
        if getattr(audio1, 'ndim', 1) == 2:
            chroma1 = audio1
            chroma2 = librosa.feature.chroma_cqt(y=audio2, sr=sr, hop_length=hop, bins_per_octave=36)
            
            min_cols = min(chroma1.shape[1], chroma2.shape[1])
            if min_cols <= 0:
                return 0.5
            chroma1 = chroma1[:, :min_cols]
            chroma2 = chroma2[:, :min_cols]
        else:
            # Match lengths: use the shorter of the two for comparison
            min_len = min(len(audio1), len(audio2))
            if min_len < sr * 0.5:  # less than 0.5 seconds → unreliable
                return 0.5

            a1 = audio1[:min_len]
            a2 = audio2[:min_len]

            # Compute chromagrams (12 pitch classes × time frames)
            chroma1 = librosa.feature.chroma_cqt(y=a1, sr=sr, hop_length=hop, bins_per_octave=36)
            chroma2 = librosa.feature.chroma_cqt(y=a2, sr=sr, hop_length=hop, bins_per_octave=36)

        # Apply moving average across chroma vectors to reduce jitter and stabilize harmonic content
        import scipy.ndimage
        if chroma1.shape[1] > 2:
            chroma1 = scipy.ndimage.uniform_filter1d(chroma1, size=5, axis=1)
        if chroma2.shape[1] > 2:
            chroma2 = scipy.ndimage.uniform_filter1d(chroma2, size=5, axis=1)

        # Flatten to 1D vectors
        v1 = chroma1.flatten().astype(np.float64)
        v2 = chroma2.flatten().astype(np.float64)

        # Cosine similarity
        dot = np.dot(v1, v2)
        norm1 = np.linalg.norm(v1)
        norm2 = np.linalg.norm(v2)

        if norm1 < 1e-8 or norm2 < 1e-8:
            return 0.0

        sim = dot / (norm1 * norm2)
        return float(np.clip(sim, 0.0, 1.0))

    except Exception as e:
        print(f"Warning: chroma similarity failed: {e}")
        return 0.5


def compute_spectral_convergence(audio1: np.ndarray, audio2: np.ndarray,
                                  sr: int) -> float:
    """
    Compute STFT magnitude spectral convergence as secondary quality metric.
    Lower is better but we invert it to [0,1] where higher is better.
    """
    try:
        import librosa

        hop = 512
        min_len = min(len(audio1), len(audio2))
        if min_len < sr * 0.5:
            return 0.5

        a1 = audio1[:min_len]
        a2 = audio2[:min_len]

        S1 = np.abs(librosa.stft(a1, hop_length=hop))
        S2 = np.abs(librosa.stft(a2, hop_length=hop))

        # Spectral convergence: ||S1 - S2|| / ||S1||
        diff_norm = np.linalg.norm(S1 - S2, 'fro')
        ref_norm  = np.linalg.norm(S1, 'fro')

        if ref_norm < 1e-8:
            return 0.5

        sc = diff_norm / ref_norm
        # Convert to similarity: lower SC = higher similarity
        # Typical range for good transcription: 0.5 - 1.5
        # Map: 0.0 → 1.0, 2.0 → 0.0
        sim = max(0.0, 1.0 - (sc / 2.0))
        return float(sim)

    except Exception as e:
        return 0.5


# ─────────────────────────────────────────────────────────────
# PITCH ACCURACY
# ─────────────────────────────────────────────────────────────

def compute_pitch_accuracy(ref_events: list, gen_events: list,
                            window_sec: float = 0.10) -> float:
    """
    Compare reference note events (original transcription) against
    generated note events (from the synthesized+re-transcribed audio).

    This is a simplified note-level precision/recall:
    - For each note in ref, check if gen has same pitch class within window_sec
    - Pitch class match: allow ±1 semitone (enharmonic equivalents)

    Returns: F1 score [0.0, 1.0]
    """
    if not ref_events or not gen_events:
        return 0.5  # insufficient data, return neutral

    matched_ref = set()
    matched_gen = set()

    for i, ref in enumerate(ref_events):
        ref_onset = ref[0]
        ref_pitch = int(ref[2]) % 12  # pitch class

        for j, gen in enumerate(gen_events):
            if j in matched_gen:
                continue
            gen_onset = gen[0]
            gen_pitch = int(gen[2]) % 12

            # Onset within window AND pitch class matches (±1 semitone)
            onset_match = abs(ref_onset - gen_onset) <= window_sec
            pitch_match = (gen_pitch == ref_pitch or
                          abs(gen_pitch - ref_pitch) == 1 or
                          abs(gen_pitch - ref_pitch) == 11)  # wrap-around

            if onset_match and pitch_match:
                matched_ref.add(i)
                matched_gen.add(j)
                break

    precision = len(matched_gen) / max(len(gen_events), 1)
    recall    = len(matched_ref) / max(len(ref_events), 1)

    if precision + recall < 1e-6:
        return 0.0

    f1 = 2 * precision * recall / (precision + recall)
    return float(np.clip(f1, 0.0, 1.0))


# ─────────────────────────────────────────────────────────────
# RHYTHM ACCURACY
# ─────────────────────────────────────────────────────────────

def _duration_class(dur_beats: float) -> str:
    """Map a duration in beats to a note category."""
    if dur_beats >= 3.5:  return "whole"
    if dur_beats >= 1.75: return "half"
    if dur_beats >= 0.875: return "quarter"
    if dur_beats >= 0.4:  return "eighth"
    return "sixteenth"


def compute_rhythm_accuracy(ref_events: list, gen_events: list,
                             tempo: float, window_sec: float = 0.12) -> float:
    """
    Compare duration classes between ref and gen note events.
    For each matched onset pair (within window_sec), check if duration class matches.

    Returns: proportion of matched notes with correct duration class [0.0, 1.0]
    """
    if not ref_events or not gen_events:
        return 0.5

    beat_dur = 60.0 / max(tempo, 40.0)
    matched_correct = 0
    matched_total   = 0

    for ref in ref_events:
        ref_onset = ref[0]
        ref_dur_beats = (ref[1] - ref[0]) / beat_dur
        ref_class = _duration_class(ref_dur_beats)

        for gen in gen_events:
            gen_onset = gen[0]
            if abs(ref_onset - gen_onset) <= window_sec:
                gen_dur_beats = (gen[1] - gen[0]) / beat_dur
                gen_class = _duration_class(gen_dur_beats)
                matched_total += 1
                if ref_class == gen_class:
                    matched_correct += 1
                break

    if matched_total == 0:
        return 0.5

    return float(np.clip(matched_correct / matched_total, 0.0, 1.0))


# ─────────────────────────────────────────────────────────────
# TEMPO ACCURACY
# ─────────────────────────────────────────────────────────────

def compute_tempo_accuracy(ref_tempo: float, gen_tempo: float) -> float:
    """
    Score tempo accuracy as [0, 1].
    Penalises double/half tempo errors severely.
    """
    if ref_tempo <= 0 or gen_tempo <= 0:
        return 0.0

    # Direct match
    ratio = gen_tempo / ref_tempo
    # Check at 1x, 0.5x, 2x (sub/super octave)
    best_err = min(
        abs(ratio - 1.0),
        abs(ratio - 0.5),
        abs(ratio - 2.0)
    )
    # Score: 0% error → 1.0, 25% error → 0.0
    score = max(0.0, 1.0 - best_err / 0.25)
    return float(np.clip(score, 0.0, 1.0))


# ─────────────────────────────────────────────────────────────
# FULL ROUND-TRIP EVALUATION
# ─────────────────────────────────────────────────────────────

def evaluate_round_trip(orig_audio: np.ndarray, orig_sr: int,
                         note_events: list, tempo: float, grid_resolution: float = 0.25) -> dict:
    """
    Run full round-trip evaluation:
    1. Synthesize piano audio from note events
    2. Compare orig vs synthesized via chromagram similarity
    3. Extract quality sub-scores

    Returns:
        dict with keys: chroma_similarity, pitch_accuracy, rhythm_accuracy,
                        tempo_accuracy, overall_score (all in [0.0, 1.0])
    """
    # Synthesize piano audio from the transcribed note events
    synth_sr   = min(orig_sr, 22050)  # cap synthesis rate for speed
    synth_audio = synthesize_from_notes(note_events, tempo, sr=synth_sr, grid_resolution=grid_resolution)

    # Resample orig_audio if needed for comparison
    if orig_sr != synth_sr:
        try:
            import librosa
            orig_resampled = librosa.resample(orig_audio, orig_sr=orig_sr, target_sr=synth_sr)
        except Exception:
            orig_resampled = orig_audio
    else:
        orig_resampled = orig_audio

    # Level 1: Chromagram similarity
    chroma_sim = compute_chroma_similarity(orig_resampled, synth_audio, synth_sr)

    # Level 2: Spectral convergence as secondary chroma metric
    spectral_sim = compute_spectral_convergence(orig_resampled, synth_audio, synth_sr)

    # Combine chroma scores (chroma_cqt weighted more heavily)
    combined_chroma = chroma_sim * 0.75 + spectral_sim * 0.25

    # Pitch accuracy: use note events themselves (self-consistency check)
    # Compare the event pitches vs what a simple onset detector would find
    pitch_acc = _estimate_pitch_accuracy_from_chroma(orig_resampled, note_events, synth_sr)

    # Rhythm accuracy: compare note duration distribution vs expected
    rhythm_acc = _estimate_rhythm_accuracy_from_events(note_events, tempo)

    # Tempo accuracy: N/A here since we're using the detected tempo
    # We score based on consistency of tempo estimate
    tempo_acc = _estimate_tempo_consistency(note_events, tempo, grid_resolution)

    # Overall weighted score
    overall = (
        combined_chroma * 0.40 +
        pitch_acc       * 0.25 +
        rhythm_acc      * 0.20 +
        tempo_acc       * 0.15
    )

    return {
        "chroma_similarity":  round(float(np.clip(combined_chroma, 0.0, 1.0)), 4),
        "pitch_accuracy":     round(float(np.clip(pitch_acc,       0.0, 1.0)), 4),
        "rhythm_accuracy":    round(float(np.clip(rhythm_acc,      0.0, 1.0)), 4),
        "tempo_accuracy":     round(float(np.clip(tempo_acc,       0.0, 1.0)), 4),
        "overall_score":      round(float(np.clip(overall,         0.0, 1.0)), 4),
    }


def _estimate_pitch_accuracy_from_chroma(orig_audio: np.ndarray,
                                          note_events: list, sr: int) -> float:
    """
    Estimate pitch accuracy by comparing the pitch classes present in the
    original audio's chromagram against the detected note events.
    """
    try:
        import librosa

        if len(orig_audio) < sr * 0.3:
            return 0.75  # too short for reliable estimate

        # Get dominant pitch classes in original dynamically based on energy
        chroma = librosa.feature.chroma_cqt(y=orig_audio, sr=sr, hop_length=512)
        
        # Energy gating: keep only frames with sufficient energy to filter out silence and low-SNR decay noise
        frame_energies = np.sum(chroma, axis=0)
        max_frame_energy = np.max(frame_energies)
        if max_frame_energy > 0:
            active_frames = chroma[:, frame_energies >= 0.15 * max_frame_energy]
            if active_frames.shape[1] > 0:
                chroma_mean = np.mean(active_frames, axis=1)
            else:
                chroma_mean = np.mean(chroma, axis=1)
        else:
            chroma_mean = np.mean(chroma, axis=1)

        max_energy = np.max(chroma_mean)
        if max_energy > 0:
            # 1. Start with raw candidates above 30% of max energy
            raw_candidates = np.where(chroma_mean >= 0.30 * max_energy)[0]
            top_classes_orig = set()
            
            # 2. Filter out adjacent semitone CQT leakage (non-maximum suppression)
            for p in raw_candidates:
                is_leakage = False
                for neighbor in [(p - 1) % 12, (p + 1) % 12]:
                    if chroma_mean[neighbor] > chroma_mean[p] and chroma_mean[p] < 0.65 * chroma_mean[neighbor]:
                        is_leakage = True
                        break
                if not is_leakage:
                    top_classes_orig.add(p)
        else:
            top_classes_orig = set()
            
        # Fallback to top 6 classes only if no classes are detected (e.g. silence)
        if len(top_classes_orig) == 0:
            top_classes_orig = set(np.argsort(chroma_mean)[-6:])

        # Get pitch classes from detected notes
        if not note_events:
            return 1.0
        detected_classes = set(int(ev[2]) % 12 for ev in note_events)

        # How many detected pitch classes appear in the original?
        if not detected_classes:
            return 0.5

        # Refined recall: any top class in the original is "matched" if it's detected OR if it's a harmonic of a detected class.
        # Overtones: fundamental, 3rd harmonic (fifth: +7 semitones), 5th harmonic (major third: +4 semitones), 7th harmonic (minor seventh: +10 semitones)
        harmonics_of_detected = set()
        for dc in detected_classes:
            harmonics_of_detected.update({dc, (dc + 7) % 12, (dc + 4) % 12, (dc + 10) % 12})

        matched_orig = top_classes_orig & (detected_classes | harmonics_of_detected)
        recall = len(matched_orig) / len(top_classes_orig)

        # Refined precision: direct matches between detected pitch classes and original pitch classes
        overlap = len(detected_classes & top_classes_orig)
        precision = overlap / len(detected_classes)

        if precision + recall < 1e-6:
            return 0.5

        f1 = 2 * precision * recall / (precision + recall)
        return float(np.clip(f1, 0.0, 1.0))

    except Exception:
        return 0.75


def _estimate_rhythm_accuracy_from_events(note_events: list, tempo: float) -> float:
    """
    Estimate rhythm quality by checking if detected note durations
    cluster around standard musical values (quarter, half, eighth, etc.)
    
    High-quality transcription: most notes have "clean" durations.
    Fragmented transcription: most notes have unusual sub-eighth durations.
    """
    if not note_events:
        return 0.5

    beat_dur = 60.0 / max(tempo, 40.0)
    standard_durations = [4.0, 3.0, 2.0, 1.5, 1.0, 0.75, 0.5, 0.375, 0.25]

    clean_count = 0
    for ev in note_events:
        dur_sec   = ev[1] - ev[0]
        dur_beats = dur_sec / beat_dur

        # Check if duration is within 15% of any standard value
        is_clean = any(
            abs(dur_beats / std - 1.0) < 0.20
            for std in standard_durations
            if std <= 4.0
        )
        if is_clean:
            clean_count += 1

    return float(np.clip(clean_count / len(note_events), 0.0, 1.0))


def _estimate_tempo_consistency(note_events: list, tempo: float, grid_resolution: float = 0.25) -> float:
    """
    Evaluate how well note onsets align with the beat grid at the detected tempo.
    High alignment = tempo is correctly detected.
    Low alignment = tempo is off (double/half error).

    ERROR IS BEAT-NORMALISED so that double-time does not artificially improve score.
    At any tempo, a 0.5-beat error is the maximum possible on a grid and maps to score=0.
    """
    if len(note_events) < 4:
        return 0.80

    beat_dur  = 60.0 / max(tempo, 40.0)
    grid_step = beat_dur * grid_resolution

    onsets = sorted(ev[0] for ev in note_events)

    errors = []
    for onset in onsets:
        grid_pos  = round(onset / grid_step)
        grid_time = grid_pos * grid_step
        # Normalise by beat_dur so the scale is independent of tempo
        err = abs(onset - grid_time) / beat_dur
        errors.append(err)

    mean_err = float(np.mean(errors))
    # Map: 0 → 1.0, 0.5 beat → 0.0  (half-beat is the worst possible on this grid)
    score = max(0.0, 1.0 - mean_err / 0.5)
    return float(np.clip(score, 0.0, 1.0))



# ─────────────────────────────────────────────────────────────
# QUICK STANDALONE CHROMA SCORE (for self-tuning loop)
# ─────────────────────────────────────────────────────────────

# How many seconds to use for comparison in the self-tuning loop.
# 25 seconds captures the full harmonic variety of most pieces while
# keeping synthesis cost bounded to ~0.5s per iteration on CPU.
_COMPARE_WINDOW_SEC = 25.0

def quick_chroma_score(orig_audio: np.ndarray, orig_sr: int,
                        note_events: list, tempo: float, grid_resolution: float = 0.25) -> float:
    """
    Fast single-number score for use in the self-tuning loop.
    Only computes chromagram similarity (no full quality breakdown).
    Can accept a precomputed 2D chromagram in place of orig_audio.

    PERFORMANCE: note events are clipped to the first _COMPARE_WINDOW_SEC seconds
    so the synthesized audio is short and chroma_cqt runs quickly even for
    long recordings.
    """
    synth_sr = min(orig_sr, 22050)

    # Clip notes to the comparison window so synthesis stays fast
    clipped_events = [ev for ev in note_events if ev[0] < _COMPARE_WINDOW_SEC]
    if not clipped_events:
        clipped_events = note_events  # fall back if nothing in first window

    synth_audio = synthesize_from_notes(clipped_events, tempo, sr=synth_sr,
                                        grid_resolution=grid_resolution)

    # Also clip synthesised audio to the same window (note durations can extend past onset)
    max_synth_samples = int(_COMPARE_WINDOW_SEC * synth_sr)
    if len(synth_audio) > max_synth_samples:
        synth_audio = synth_audio[:max_synth_samples]

    if getattr(orig_audio, 'ndim', 1) == 2:
        return compute_chroma_similarity(orig_audio, synth_audio, synth_sr)

    if orig_sr != synth_sr:
        try:
            import librosa
            orig_res = librosa.resample(orig_audio, orig_sr=orig_sr, target_sr=synth_sr)
        except Exception:
            orig_res = orig_audio
    else:
        orig_res = orig_audio

    # Clip orig to comparison window
    if len(orig_res) > max_synth_samples:
        orig_res = orig_res[:max_synth_samples]

    return compute_chroma_similarity(orig_res, synth_audio, synth_sr)
