#!/bin/bash
mkdir -p /root/piano_transcription_inference_data
python3 << 'EOF'
import urllib.request
import sys

url = 'https://zenodo.org/record/4034264/files/CRNN_note_F1%3D0.9677_pedal_F1%3D0.9186.pth?download=1'
dst = '/root/piano_transcription_inference_data/note_F1=0.9677_pedal_F1=0.9186.pth'

try:
    print(f"Downloading model to {dst}...")
    urllib.request.urlretrieve(url, dst)
    print("Download complete!")
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
EOF