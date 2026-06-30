# test_bt.py
import sys
import os
import torch
import librosa
from piano_transcription_inference import PianoTranscription, sample_rate

def test_transcription():
    filepath = "tyler.wav"
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"Using device: {device}")
    
    transcriber = PianoTranscription(device=device)
    print("Transcribing...")
    
    audio, sr = librosa.load(filepath, sr=sample_rate, mono=True)
    print(f"Audio loaded. sr={sr}, length={len(audio)} samples")
    
    transcribed_dict = transcriber.transcribe(audio, None)
    
    notes = transcribed_dict['est_note_events']
    print(f"Successfully transcribed. Detected notes: {len(notes)}")
    
    for n in notes[:15]:
        print(n)

if __name__ == "__main__":
    test_transcription()
