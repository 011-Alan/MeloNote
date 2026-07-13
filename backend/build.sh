#!/bin/bash
set -e
mkdir -p /root/piano_transcription_inference_data
python3 -c "
import urllib.request
url = 'https://zenodo.org/record/4034264/files/CRNN_note_F1%3D0.9677_pedal_F1%3D0.9186.pth?download=1'
dst = '/root/piano_transcription_inference_data/note_F1=0.9677_pedal_F1=0.9186.pth'
print('Downloading model...')
urllib.request.urlretrieve(url, dst)
print('Done!')
"