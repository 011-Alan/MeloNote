# -*- coding: utf-8 -*-
# preprocess.py -- Audio Preprocessing Pipeline for MeloNote
import os
import subprocess
import numpy as np
import librosa
import json
from scipy.signal import butter, filtfilt
from scipy.ndimage import gaussian_filter1d

# Audio container formats that libsndfile (soundfile) cannot read directly.
# For these, we use ffmpeg to convert to a temporary 16-bit PCM WAV first.
# NOTE: .m4a and .mp4 (AAC in MP4 container) are also unsupported by libsndfile
# and must go through ffmpeg — this is the format Android's Expo recorder produces.
NEEDS_FFMPEG_CONVERT = {'.webm', '.ogg', '.opus', '.oga', '.aac', '.m4a', '.mp4'}

def _get_ffmpeg_exe() -> str:
    """
    Resolve the ffmpeg executable path.
    Prefers the bundled ffmpeg from imageio-ffmpeg (self-contained in venv),
    then falls back to 'ffmpeg' on the system PATH.
    """
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"

def convert_to_wav_via_ffmpeg(input_path: str) -> str:
    """
    Convert an audio file to a 16-bit PCM WAV using ffmpeg.
    Returns the path to the converted WAV file.
    Raises RuntimeError if ffmpeg is not found or conversion fails.
    """
    ffmpeg_exe = _get_ffmpeg_exe()
    base    = os.path.splitext(input_path)[0]
    out_wav = f"{base}_converted.wav"
    print(f"[preprocess] ffmpeg converting '{input_path}' -> '{out_wav}' ...")
    print(f"[preprocess] ffmpeg binary: {ffmpeg_exe}")
    try:
        result = subprocess.run(
            [
                ffmpeg_exe, "-y",      # overwrite output
                "-i", input_path,      # input file
                "-ar", "44100",        # sample rate (librosa will resample later)
                "-ac", "1",            # mono
                "-sample_fmt", "s16",  # 16-bit PCM
                out_wav,
            ],
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        raise RuntimeError(
            "ffmpeg not found. Install ffmpeg or add imageio-ffmpeg to requirements."
        )
    if result.returncode != 0:
        raise RuntimeError(
            f"ffmpeg conversion failed (exit {result.returncode}):\n{result.stderr[-2000:]}"
        )
    if not os.path.exists(out_wav) or os.path.getsize(out_wav) == 0:
        raise RuntimeError(f"ffmpeg produced an empty or missing file: {out_wav}")
    print(f"[preprocess] ffmpeg OK — converted file: {os.path.getsize(out_wav)} bytes")
    return out_wav

def load_adaptive_thresholds() -> dict:
    """
    Loads processing thresholds from adaptive_thresholds.json,
    adjusting them based on past error logs in past_errors.json.
    """
    default_thresholds = {
        "zcr_threshold": 0.08,
        "flatness_threshold": 0.015,
        "centroid_threshold": 2250.0,
        "noise_floor_threshold": -45.0
    }
    
    thresholds_file = "adaptive_thresholds.json"
    if os.path.exists(thresholds_file):
        try:
            with open(thresholds_file, "r") as f:
                thresholds = json.load(f)
        except Exception:
            thresholds = default_thresholds.copy()
    else:
        thresholds = default_thresholds.copy()
        
    errors_file = "past_errors.json"
    if os.path.exists(errors_file):
        try:
            with open(errors_file, "r") as f:
                errors = json.load(f)
                if not isinstance(errors, list):
                    errors = []
        except Exception:
            errors = []
            
        noise_errors = 0
        vocal_errors = 0
        for err in errors:
            err_type = err.get("error_type")
            if err_type == "high_noise":
                noise_errors += 1
            elif err_type == "vocals_or_clutter":
                vocal_errors += 1
                
        adapted = False
        if noise_errors >= 2:
            new_val = max(-55.0, thresholds.get("noise_floor_threshold", -45.0) - 3.0)
            if new_val != thresholds.get("noise_floor_threshold"):
                print(f"[adaptive] Detected {noise_errors} past noise errors. Adjusting noise_floor_threshold from {thresholds.get('noise_floor_threshold')} to {new_val} dB.")
                thresholds["noise_floor_threshold"] = new_val
                adapted = True
                
        if vocal_errors >= 2:
            new_flatness = max(0.010, thresholds.get("flatness_threshold", 0.015) - 0.002)
            new_zcr = max(0.05, thresholds.get("zcr_threshold", 0.08) - 0.01)
            if new_flatness != thresholds.get("flatness_threshold") or new_zcr != thresholds.get("zcr_threshold"):
                print(f"[adaptive] Detected {vocal_errors} past vocal/clutter errors. Adjusting flatness_threshold to {new_flatness} and zcr_threshold to {new_zcr}.")
                thresholds["flatness_threshold"] = new_flatness
                thresholds["zcr_threshold"] = new_zcr
                adapted = True
                
        if adapted:
            try:
                with open(thresholds_file, "w") as f:
                    json.dump(thresholds, f, indent=2)
            except Exception as e:
                print(f"[adaptive] Failed to save updated thresholds: {e}")
                
    return thresholds

def normalize_rms(y: np.ndarray, target_rms: float = 0.05, peak_limit: float = 0.95) -> np.ndarray:
    """
    Step 01: Normalize Audio Levels.
    Standardise the volume of the recording to a target RMS value,
    and scale down peak values if they exceed peak_limit to prevent clipping.
    """
    rms = np.sqrt(np.mean(y**2))
    if rms > 0:
        # Scale to target RMS
        y = y * (target_rms / rms)
    
    # Check for clipping and limit peaks
    peak = np.max(np.abs(y))
    if peak > peak_limit:
        y = y * (peak_limit / peak)
        
    return y

def highpass_filter(y: np.ndarray, sr: int, cutoff: float = 50.0, order: int = 5) -> np.ndarray:
    """
    Step 02: Remove Background Noise (High-pass).
    Apply a 5th-order Butterworth high-pass filter to remove low-frequency room rumble and hum.
    """
    nyq = 0.5 * sr
    normal_cutoff = cutoff / nyq
    b, a = butter(order, normal_cutoff, btype='high', analog=False)
    y_filtered = filtfilt(b, a, y)
    return y_filtered

def spectral_gating_noise_reduction(y: np.ndarray, sr: int, noise_floor_db: float = -45.0, reduction_db: float = 12.0) -> np.ndarray:
    """
    Step 02b: Remove Background Noise (Spectral Gating / Spectral Subtraction).
    Calculates the STFT of the audio, estimates the ambient noise profile from the lowest energy frames,
    applies a time-frequency soft gate mask, and computes the inverse STFT.
    """
    # Parameters for STFT
    n_fft = 2048
    hop_length = 512
    
    # Compute STFT
    stft = librosa.stft(y, n_fft=n_fft, hop_length=hop_length)
    magnitude, phase = librosa.magphase(stft)
    
    # Estimate noise threshold for each frequency bin from lowest-energy 5% of frames
    energy = np.sum(magnitude**2, axis=0)
    num_noise_frames = max(1, int(len(energy) * 0.05))
    low_energy_indices = np.argsort(energy)[:num_noise_frames]
    
    # Average noise magnitude profile across the noise frames
    noise_profile = np.mean(magnitude[:, low_energy_indices], axis=1, keepdims=True)
    
    # Smooth the noise profile across frequencies to prevent musical noise
    noise_profile = gaussian_filter1d(noise_profile, sigma=2.0, axis=0)
    
    # Soft thresholding mask: smooth transition from signal to noise floor
    mask = magnitude / (noise_profile + 1e-8)
    mask = np.clip(mask, 0.0, 1.0)
    
    # Smooth mask across time frames to prevent chatter
    mask = gaussian_filter1d(mask, sigma=1.0, axis=1)
    
    # Apply attenuation factor to gated out bins
    reduction_factor = 10**(-reduction_db / 20.0)
    stft_clean = stft * (mask + (1.0 - mask) * reduction_factor)
    
    # Inverse STFT to get back clean audio
    y_clean = librosa.istft(stft_clean, hop_length=hop_length)
    
    # Ensure length matches original y
    if len(y_clean) > len(y):
        y_clean = y_clean[:len(y)]
    elif len(y_clean) < len(y):
        y_clean = np.pad(y_clean, (0, len(y) - len(y_clean)))
        
    return y_clean

def resample_and_mono(y: np.ndarray, orig_sr: int, target_sr: int = 16000) -> np.ndarray:
    """
    Step 03: Resample and Convert to Mono.
    Ensures the audio is single-channel and has the sample rate expected by the model.
    """
    if y.ndim > 1:
        y = librosa.to_mono(y)
    if orig_sr != target_sr:
        y = librosa.resample(y, orig_sr=orig_sr, target_sr=target_sr)
    return y

def trim_silence(y: np.ndarray, sr: int, top_db: float = 40.0) -> np.ndarray:
    """
    Step 04: Trim Silence.
    Removes leading and trailing silence below top_db threshold.
    """
    y_trimmed, _ = librosa.effects.trim(y, top_db=top_db)
    return y_trimmed

def save_spectrogram(y: np.ndarray, sr: int, output_path: str) -> None:
    """
    Step 05: Spectrogram Generation.
    Computes an STFT spectrogram, applies log-dB scaling, normalizes to [0, 1],
    and saves as a numpy array for diagnostic and model reference.
    """
    stft = librosa.stft(y, n_fft=2048, hop_length=512)
    magnitude = np.abs(stft)
    
    # Convert to log scale (amplitude to dB)
    log_spec = librosa.amplitude_to_db(magnitude, ref=np.max)
    
    # Normalize to [0, 1] range
    spec_min = np.min(log_spec)
    spec_max = np.max(log_spec)
    norm_spec = (log_spec - spec_min) / (spec_max - spec_min + 1e-8)
    
    np.save(output_path, norm_spec)

def estimate_audio_complexity(y: np.ndarray, sr: int, zcr_threshold: float = 0.08, flatness_threshold: float = 0.015, centroid_threshold: float = 2250.0) -> dict:
    """
    Estimates the audio complexity to decide if Spleeter/HPSS, pitch tracker,
    or ensemble is needed. Configurable thresholds for ZCR, Flatness, and Centroid.
    """
    zcr = np.mean(librosa.feature.zero_crossing_rate(y))
    flatness = np.mean(librosa.feature.spectral_flatness(y=y))
    centroid = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))
    
    # Calculate note onset density estimate
    try:
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        peaks = librosa.util.peak_pick(onset_env, pre_max=3, post_max=3, pre_avg=3, post_avg=5, delta=0.5, wait=10)
        density = len(peaks) / (len(y) / sr + 1e-8)
    except Exception:
        density = 5.0 # fallback default density
    
    # Vocals usually introduce zero-crossings and spectral centroid variance
    vocals_present = (zcr > zcr_threshold and flatness > flatness_threshold) or (centroid > centroid_threshold)
    
    return {
        "vocals_present": bool(vocals_present),
        "density": float(density),
        "zcr": float(zcr),
        "flatness": float(flatness),
        "centroid": float(centroid),
        "zcr_threshold": zcr_threshold,
        "flatness_threshold": flatness_threshold,
        "centroid_threshold": centroid_threshold
    }

def separate_piano_sources(y: np.ndarray, sr: int, use_spleeter: str = "auto", filepath: str = None, complexity_info: dict = None, speed_preset: str = "accurate") -> tuple:
    """
    Modular piano source separator with spleeter interface and DSP HPSS fallback.
    If speed_preset is 'fast', we bypass separation entirely to minimize latency.
    """
    spleeter_activated = False
    hpss_activated = False
    reason = "Bypassed (not requested or vocals not detected)"
    
    if speed_preset == "fast":
        reason = "Bypassed (Speed preset is 'fast')"
        return y, spleeter_activated, hpss_activated, reason
        
    should_separate = False
    if use_spleeter == "true":
        should_separate = True
        reason = "Active (explicitly requested)"
    elif use_spleeter == "auto":
        if complexity_info and complexity_info.get("vocals_present", False):
            should_separate = True
            reason = f"Active (Vocals/Overlapping detected: Flatness {complexity_info['flatness']:.3f} > {complexity_info.get('flatness_threshold', 0.015)})"
            
    if not should_separate:
        return y, spleeter_activated, hpss_activated, reason
        
    try:
        from spleeter.separator import Separator
        print("[preprocess] Spleeter found. Starting separation...")
        waveform = y[:, np.newaxis] if y.ndim == 1 else y
        if waveform.shape[1] == 1:
            waveform = np.concatenate([waveform, waveform], axis=1)
            
        separator = Separator('spleeter:2stems')
        prediction = separator.separate(waveform)
        
        piano_audio = prediction['accompaniment']
        if piano_audio.ndim > 1:
            piano_audio = librosa.to_mono(piano_audio.T)
        y = piano_audio
        spleeter_activated = True
        reason = "Active (Spleeter isolated piano successfully)"
    except Exception as e:
        print(f"[preprocess] Spleeter failed or unavailable ({e}). Falling back to HPSS...")
        y_harmonic, y_percussive = librosa.effects.hpss(y)
        y = y_harmonic
        hpss_activated = True
        reason = f"Active (Spleeter unavailable. HPSS fell back to extract harmonic component)"
        
    return y, spleeter_activated, hpss_activated, reason

def preprocess_audio(filepath: str, target_sr: int = 16000, out_spectrogram_path: str = None, use_spleeter: str = "auto", speed_preset: str = "accurate") -> tuple:
    """
    Runs the complete preprocessing pipeline on an audio file path:
      1. Load file
      2. Convert to mono & resample to 16 kHz
      3. Estimate complexity and run source separation (Spleeter/HPSS)
      4. Measure noise floor and trigger Spectral Gating if > threshold
      5. Normalize RMS levels & limit peaks
      6. Filter out Room Rumble below 25 Hz
      7. Trim silence from head and tail
      8. Save normalized spectrogram as .npy
    
    Returns:
      (cleaned_audio_array, target_sr, complexity_info)
    """
    print(f"[preprocess] Starting pipeline on {filepath} (Preset: {speed_preset}) ...")
    
    # If the format cannot be decoded by soundfile, convert to WAV with ffmpeg first.
    ext = os.path.splitext(filepath)[1].lower()
    load_path = filepath
    converted_tmp = None
    if ext in NEEDS_FFMPEG_CONVERT:
        print(f"[preprocess] Format '{ext}' requires ffmpeg conversion before librosa.load()")
        converted_tmp = convert_to_wav_via_ffmpeg(filepath)
        load_path = converted_tmp
        print(f"[preprocess] Using converted file for loading: {load_path}")
    
    # Load audio
    y, sr = librosa.load(load_path, sr=None, mono=True)
    orig_len = len(y) / sr
    print(f"[preprocess] Loaded {orig_len:.1f}s audio at {sr} Hz")
    
    # Clean up the temporary converted WAV (keep the original upload)
    if converted_tmp and os.path.exists(converted_tmp):
        os.remove(converted_tmp)
        print(f"[preprocess] Removed temp converted file: {converted_tmp}")
    
    # 3. Resample and Mono
    y = resample_and_mono(y, sr, target_sr)
    print(f"[preprocess] Resampled to {target_sr} Hz mono")
    
    # Load adaptive thresholds
    thresholds = load_adaptive_thresholds()
    zcr_t = thresholds["zcr_threshold"]
    flatness_t = thresholds["flatness_threshold"]
    centroid_t = thresholds["centroid_threshold"]
    noise_t = thresholds["noise_floor_threshold"]
    
    # Estimate audio complexity
    complexity_info = estimate_audio_complexity(y, target_sr, zcr_threshold=zcr_t, flatness_threshold=flatness_t, centroid_threshold=centroid_t)
    print(f"[preprocess] Complexity: Vocals={complexity_info['vocals_present']}, Density={complexity_info['density']:.2f}")
    
    # Source separation
    y, spleeter_act, hpss_act, separation_reason = separate_piano_sources(y, target_sr, use_spleeter, filepath, complexity_info, speed_preset)
    complexity_info["spleeter_activated"] = spleeter_act
    complexity_info["hpss_activated"] = hpss_act
    complexity_info["spleeter_reason"] = separation_reason if spleeter_act else "Bypassed (not requested or vocals not detected)"
    complexity_info["hpss_reason"] = separation_reason if hpss_act else "Bypassed (vocals not detected)"
    if speed_preset == "fast":
        complexity_info["spleeter_reason"] = "Bypassed (Speed preset is 'fast')"
        complexity_info["hpss_reason"] = "Bypassed (Speed preset is 'fast')"
        
    # Measure noise floor using lowest 5% energy frames
    stft = librosa.stft(y, n_fft=2048, hop_length=512)
    magnitude = np.abs(stft)
    energy = np.sum(magnitude**2, axis=0)
    num_noise_frames = max(1, int(len(energy) * 0.05))
    low_energy = energy[np.argsort(energy)[:num_noise_frames]]
    noise_floor_rms = np.sqrt(np.mean(low_energy) / 2048.0)
    noise_floor_db = float(20 * np.log10(noise_floor_rms + 1e-8))
    
    complexity_info["noise_floor_db"] = noise_floor_db
    complexity_info["noise_floor_threshold"] = noise_t
    
    run_spectral_gate = False
    if speed_preset == "fast":
        complexity_info["spectral_gating_activated"] = False
        complexity_info["spectral_gating_reason"] = "Bypassed (Speed preset is 'fast')"
    elif noise_floor_db > noise_t:
        run_spectral_gate = True
        complexity_info["spectral_gating_activated"] = True
        complexity_info["spectral_gating_reason"] = f"Active (Noise floor {noise_floor_db:.1f} dB > threshold {noise_t:.1f} dB)"
    else:
        complexity_info["spectral_gating_activated"] = False
        complexity_info["spectral_gating_reason"] = f"Bypassed (Noise floor {noise_floor_db:.1f} dB <= threshold {noise_t:.1f} dB)"
        
    print(f"[preprocess] Spectral Gating decision: {complexity_info['spectral_gating_reason']}")
    
    # 1. Normalize Audio Levels (Peak Normalization to 0.95 to preserve quiet notes)
    peak = np.max(np.abs(y))
    if peak > 0:
        y = y * (0.95 / peak)
    print(f"[preprocess] Peak normalized volume to 0.95")
    
    # 2. Noise Removal: HPF (25Hz cutoff to preserve low piano notes, Butterworth always ACTIVE)
    y = highpass_filter(y, target_sr, cutoff=25.0)
    print(f"[preprocess] Applied HPF filter (25Hz) (Butterworth Filter ACTIVE)")
    
    if run_spectral_gate:
        y = spectral_gating_noise_reduction(y, target_sr, noise_floor_db=noise_floor_db)
        print(f"[preprocess] Applied Spectral Gating noise reduction ({noise_floor_db:.1f} dB)")
    
    # 4. Trim Silence
    y_trimmed = trim_silence(y, target_sr, top_db=40.0)
    trimmed_sec = (len(y) - len(y_trimmed)) / target_sr
    print(f"[preprocess] Trimmed {trimmed_sec:.2f}s of silence")
    y = y_trimmed

    # Apply 20ms fade-in and 50ms fade-out to prevent trimming click boundary artifacts
    fade_in_len = int(target_sr * 0.02)
    fade_out_len = int(target_sr * 0.05)
    if len(y) > fade_in_len:
        y[:fade_in_len] *= np.linspace(0.0, 1.0, fade_in_len)
    if len(y) > fade_out_len:
        y[-fade_out_len:] *= np.linspace(1.0, 0.0, fade_out_len)
    
    # 5. Spectrogram Generation
    if out_spectrogram_path is None:
        # Save near input file with same name
        base, _ = os.path.splitext(filepath)
        out_spectrogram_path = f"{base}_spectrogram.npy"
        
    save_spectrogram(y, target_sr, out_spectrogram_path)
    print(f"[preprocess] Exported normalized log-spectrogram to {out_spectrogram_path}")
    
    return y, target_sr, complexity_info
