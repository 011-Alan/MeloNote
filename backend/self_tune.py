# -*- coding: utf-8 -*-
# self_tune.py -- Parameter Self-Tuning Loop for MeloNote
#
# Fixes applied:
# 1. librosa beat_track is protected from deduplication (always included).
# 2. Timing shift penalty normalised by beat duration (removes double-time bias).
# 3. Librosa proximity bonus added so half/double-time tempos don't sneak in.
# 4. Musical measure-density score used alongside chroma to break tempo ties.

import copy
import numpy as np
from evaluate import quick_chroma_score, evaluate_round_trip, quantize_note_events


# -----------------------------------------------------------
# POST-PROCESSING RUNNERS (cheap, re-run for each parameter set)
# -----------------------------------------------------------

def _run_post_processing(raw_note_events: list, gap_threshold: float) -> list:
    """
    Apply just the cheap post-processing steps for a given gap_threshold.
    The expensive ByteDance transcription is NOT re-run — only these steps:
      1. Note merging (gap-controlled)
      2. Harmonic suppression
    """
    from analyze import suppress_harmonics, merge_fragmented_notes

    events = copy.deepcopy(raw_note_events)
    events = suppress_harmonics(events, onset_tolerance=0.08, verbose=False)
    events = merge_fragmented_notes(events, gap_threshold=gap_threshold)
    return events


# -----------------------------------------------------------
# MUSICAL MEASURE-DENSITY SCORE  (tempo disambiguation helper)
# -----------------------------------------------------------

def _musical_quality_score(note_events: list, tempo: float) -> float:
    """
    Score how musically natural a tempo is for the given note events.
    Returns a value in [0, 1]; higher = more musically valid.

    Uses:
    - Notes-per-measure distribution (piano: 2-6 per measure is ideal)
    - Beat-normalised onset alignment (0 = perfect, 1 = misaligned)
    - Note duration naturalness at this tempo
    """
    if not note_events or tempo <= 0:
        return 0.5

    beat_dur  = 60.0 / tempo
    grid_step = beat_dur / 4  # 16th-note grid

    onsets = sorted(e[0] for e in note_events)
    total_dur = max(e[1] for e in note_events) if note_events else 1.0

    # 1. Onset-to-16th-grid alignment (beat-normalised)
    align_errors = []
    for o in onsets:
        grid_pos = round(o / grid_step)
        err_frac = abs(o - grid_pos * grid_step) / beat_dur  # fraction of beat
        align_errors.append(err_frac)
    align_score = max(0.0, 1.0 - np.mean(align_errors) * 4) if align_errors else 0.5

    # 2. Notes-per-measure distribution
    measure_dur = beat_dur * 4.0  # assume 4/4 for scoring purposes
    num_measures = max(1, int(total_dur / measure_dur))
    notes_per_measure = []
    for m in range(num_measures):
        m_start = m * measure_dur
        m_end = (m + 1) * measure_dur
        count = sum(1 for e in note_events if m_start <= e[0] < m_end)
        notes_per_measure.append(count)

    # Ideal: 1-6 notes/measure for piano.  Too many = double-time; too few = half-time.
    IDEAL_LOW, IDEAL_HIGH = 1, 6
    density_score = np.mean([
        1.0 if IDEAL_LOW <= n <= IDEAL_HIGH else max(0.0, 1.0 - (abs(n - 3.5) - 2.5) / 5.0)
        for n in notes_per_measure if n > 0
    ]) if notes_per_measure else 0.5

    # 3. Duration naturalness
    std_beat_fracs = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0]
    natural = sum(
        1 for ev in note_events
        if any(abs((ev[1]-ev[0]) / beat_dur / f - 1.0) < 0.30 for f in std_beat_fracs)
    )
    dur_score = natural / max(len(note_events), 1)

    return float(align_score * 0.40 + density_score * 0.35 + dur_score * 0.25)


# -----------------------------------------------------------
# TEMPO CANDIDATES
# -----------------------------------------------------------

def get_tempo_candidates(note_events: list, audio: np.ndarray,
                          sr: int, lb_tempo: float) -> list:
    """
    Return a list of plausible tempo values to try.

    FIX: librosa beat_track result is always protected and never deduplicated away.
    Dedup window tightened from 5 → 3 BPM to preserve the librosa estimate.

    Sources:
    1. librosa beat_track result (protected)
    2. Half and double of lb_tempo (resolve double/half error)
    3. IOI-derived estimate (from note onset intervals)
    4. Tempogram peak
    """
    candidates = set()
    protected = None  # The librosa estimate — never removed

    # From librosa (protected)
    if 40 <= lb_tempo <= 220:
        protected = round(lb_tempo)
        candidates.add(protected)

    # Double / half of librosa
    if 40 <= lb_tempo * 0.5 <= 220:
        candidates.add(round(lb_tempo * 0.5))
    if 40 <= lb_tempo * 2.0 <= 220:
        candidates.add(round(lb_tempo * 2.0))

    # IOI-based estimate
    if len(note_events) >= 6:
        onsets = sorted(ev[0] for ev in note_events)
        intervals = [onsets[i+1] - onsets[i] for i in range(len(onsets)-1)
                     if 0.10 < onsets[i+1] - onsets[i] < 2.5]
        if intervals:
            try:
                bin_size = 0.06
                n_bins   = int(max(intervals) / bin_size) + 1
                hist     = np.zeros(n_bins)
                for ioi in intervals:
                    b = int(ioi / bin_size)
                    if 0 <= b < n_bins:
                        hist[b] += 1
                smoothed = np.convolve(hist, [0.25, 0.5, 0.25], mode='same')
                peak_bin = int(np.argmax(smoothed))
                dom_ioi  = (peak_bin + 0.5) * bin_size
                ioi_bpm  = 60.0 / dom_ioi if dom_ioi > 0 else lb_tempo
                while ioi_bpm < 40:  ioi_bpm *= 2
                while ioi_bpm > 220: ioi_bpm /= 2
                candidates.add(round(ioi_bpm))
                if 40 <= ioi_bpm * 0.5 <= 220:
                    candidates.add(round(ioi_bpm * 0.5))
                if 40 <= ioi_bpm * 2.0 <= 220:
                    candidates.add(round(ioi_bpm * 2.0))
            except Exception:
                pass

    # Tempogram estimate
    try:
        import librosa
        tg = librosa.feature.tempogram(y=audio, sr=sr, hop_length=512)
        tg_mean = np.mean(tg, axis=1)
        bpms    = librosa.tempo_frequencies(len(tg_mean), sr=sr, hop_length=512)
        mask    = (bpms >= 40) & (bpms <= 220)
        if mask.any():
            best_idx = int(np.argmax(tg_mean[mask]))
            tg_bpm   = float(bpms[mask][best_idx])
            candidates.add(round(tg_bpm))
    except Exception:
        pass

    # Deduplicate within 3 BPM (tighter window preserves the librosa estimate better)
    sorted_cands = sorted(candidates)
    deduped = []
    for c in sorted_cands:
        if not deduped or abs(c - deduped[-1]) >= 3:
            deduped.append(c)

    # Always ensure the protected librosa estimate survives
    if protected is not None and protected not in deduped:
        deduped.append(protected)
        deduped.sort()

    # Limit to at most 6 candidates (performance guard)
    return deduped[:6] if deduped else [int(lb_tempo)]


# -----------------------------------------------------------
# SELF-TUNING LOOP
# -----------------------------------------------------------

def self_tune(orig_audio: np.ndarray, orig_sr: int,
              raw_note_events: list,
              tempo_candidates: list,
              lb_tempo: float = 0.0,
              tempo_confidence: str = "HIGH",
              verbose: bool = True) -> tuple:
    """
    Search for the best transcription parameters using round-trip evaluation.

    FIXES vs previous version:
    - Timing shift penalty is beat-duration-normalised (removes double-time bias).
    - Librosa proximity bonus rewards tempos near the beat_track estimate.
    - Musical measure-density score supplements chroma to break tempo ties.

    Returns:
        (best_note_events, best_tempo, best_params, quality_scores)
    """
    param_pairs = [
        (0.25, 0.25),  # 16th grid, standard gap
        (0.25, 0.35),  # 16th grid, wider gap (for sustained notes)
        (0.25, 0.15),  # 16th grid, narrow gap
        (0.50, 0.25),  # 8th grid, standard gap
        (0.50, 0.35),  # 8th grid, wider gap
        (0.25, 0.45),  # 16th grid, very wide gap
    ]

    grid = []
    for grid_res, gap in param_pairs:
        for tempo in tempo_candidates:
            grid.append({
                "gap_threshold": gap,
                "tempo": tempo,
                "grid_resolution": grid_res
            })
            if len(grid) >= 18:
                break
        if len(grid) >= 18:
            break

    if not grid:
        grid = [{
            "gap_threshold": 0.35,
            "tempo": tempo_candidates[0] if tempo_candidates else 120,
            "grid_resolution": 0.25
        }]

    # Precompute original audio's chromagram once (cap at 25s for performance)
    orig_chroma = orig_audio
    try:
        import librosa
        synth_sr = min(orig_sr, 22050)
        # Clip to 25 seconds — enough to capture full harmonic content without
        # making each self-tune iteration take minutes on CPU.
        max_compare_samples = synth_sr * 25
        orig_clip = orig_audio[:max_compare_samples] if len(orig_audio) > max_compare_samples else orig_audio
        orig_resampled = (librosa.resample(orig_clip, orig_sr=orig_sr, target_sr=synth_sr)
                          if orig_sr != synth_sr else orig_clip)
        hop = 512
        if len(orig_resampled) >= synth_sr * 0.5:
            orig_chroma = librosa.feature.chroma_cqt(
                y=orig_resampled, sr=synth_sr, hop_length=hop, bins_per_octave=36
            )
    except Exception as e:
        if verbose:
            print(f"  [warning] precomputing chromagram failed: {e}")

    if verbose:
        print(f"[self_tune] Evaluating {len(grid)} parameter combinations "
              f"(tempos: {tempo_candidates}, librosa_ref: {lb_tempo:.1f}, confidence: {tempo_confidence})...")

    best_adjusted_score = -1.0
    best_score          = -1.0
    best_events         = raw_note_events
    best_params         = grid[0]

    for params in grid:
        try:
            t = params["tempo"]
            events = _run_post_processing(raw_note_events, params["gap_threshold"])
            if not events:
                continue

            # ── Chroma similarity ──────────────────────────────────────────
            score = quick_chroma_score(
                orig_chroma, orig_sr, events, t,
                grid_resolution=params["grid_resolution"]
            )

            # ── Timing shift penalty (BEAT-NORMALISED, fixes double-time bias) ──
            quant_events = quantize_note_events(events, t, params["grid_resolution"])
            beat_dur = 60.0 / max(t, 1)
            shifts = [abs(events[i][0] - quant_events[i][0]) / beat_dur
                      for i in range(len(events))]
            norm_shift = float(np.mean(shifts)) if shifts else 0.0
            # 0.08 coefficient: a 0.5-beat normalised shift → 0.04 penalty
            shift_penalty = 0.08 * norm_shift

            # ── Librosa proximity bonus (rewards tempos near beat_track) ──
            lb_ref = lb_tempo if lb_tempo > 0 else (tempo_candidates[len(tempo_candidates)//2]
                                                     if tempo_candidates else t)
            ratio = t / max(lb_ref, 1)
            # Check at 1x, 0.5x, 2x multiples — closest multiple to 1:1 wins
            closeness = min(abs(ratio - 1.0), abs(ratio - 0.5), abs(ratio - 2.0))
            # Bonus: 0 → +0.020, 0.20 → 0, beyond 0.20 → slight penalty
            lb_bonus = max(-0.010, 0.020 - 0.10 * closeness)
            # Extra penalty for double-time (ratio ≈ 2.0) vs half-time (ratio ≈ 0.5)
            # Double-time is more disruptive to sheet music notation
            if 1.7 <= ratio <= 2.3:
                lb_bonus -= 0.015  # penalise double-time candidates

            # ── Musical measure-density score ──────────────────────────────
            music_score = _musical_quality_score(events, t)

            # ── Combined adjusted score ────────────────────────────────────
            if tempo_confidence == "LOW":
                # Compute Duration Preservation Score
                dur_errors = []
                for ev, q_ev in zip(events, quant_events):
                    orig_dur = ev[1] - ev[0]
                    quant_dur = q_ev[1] - q_ev[0]
                    if orig_dur > 0:
                        err = abs(orig_dur - quant_dur) / orig_dur
                        dur_errors.append(max(0.0, 1.0 - err))
                dur_pres_score = float(np.mean(dur_errors)) if dur_errors else 1.0
                adjusted_score = dur_pres_score * 0.90 + score * 0.10
            else:
                dur_pres_score = 1.0
                # Chroma 65% + Musical 20% + librosa proximity 15%
                adjusted_score = (score * 0.65
                                  + music_score * 0.20
                                  + lb_bonus * 0.15 / 0.020  # normalise bonus to [0,1]-ish range
                                  - shift_penalty)

            if verbose:
                if tempo_confidence == "LOW":
                    print(f"  gap={params['gap_threshold']:.2f} tempo={int(t):3d} "
                          f"grid={params['grid_resolution']:.2f} -> "
                          f"dur_pres={dur_pres_score:.4f} chroma={score:.4f} "
                          f"adj={adjusted_score:.4f}")
                else:
                    print(f"  gap={params['gap_threshold']:.2f} tempo={int(t):3d} "
                          f"grid={params['grid_resolution']:.2f} -> "
                          f"chroma={score:.4f} music={music_score:.4f} "
                          f"lb_bonus={lb_bonus:+.3f} shift_pen={shift_penalty:.4f} "
                          f"adj={adjusted_score:.4f}")

            # Strict improvement (no tie threshold — let the combined score decide)
            if adjusted_score > best_adjusted_score:
                best_adjusted_score = adjusted_score
                best_score          = score
                best_events         = events
                best_params         = params

        except Exception as e:
            if verbose:
                print(f"  [warning] param eval failed: {e}")
            continue

    if verbose:
        print(f"[self_tune] Best: gap={best_params['gap_threshold']:.2f} "
              f"tempo={best_params['tempo']} grid={best_params['grid_resolution']:.2f} "
              f"score={best_score:.4f}")

    # Full quality breakdown for the best parameter set
    quality_scores = evaluate_round_trip(
        orig_audio, orig_sr, best_events, best_params["tempo"],
        grid_resolution=best_params["grid_resolution"]
    )
    quality_scores["best_chroma"]         = round(best_score, 4)
    quality_scores["best_gap_threshold"]  = best_params["gap_threshold"]
    quality_scores["best_tempo"]          = best_params["tempo"]
    quality_scores["best_grid_resolution"] = best_params["grid_resolution"]

    if verbose:
        print(f"[self_tune] Quality scores: {quality_scores}")

    return best_events, best_params["tempo"], best_params, quality_scores
