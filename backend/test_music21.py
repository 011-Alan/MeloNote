# test_music21.py
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
    import music21
    from basic_pitch.inference import predict
finally:
    sys.stderr = old_stderr

def run():
    filepath = "tyler.wav"
    print("Running basic-pitch prediction...")
    model_output, midi_data, note_events = predict(
        filepath,
        onset_threshold=0.5,
        frame_threshold=0.3,
        minimum_note_length=100.0
    )
    
    # Save midi_data (PrettyMIDI) to a temporary MIDI file
    temp_mid = "temp_midi.mid"
    midi_data.write(temp_mid)
    print("Saved PrettyMIDI to temp_midi.mid")
    
    # Parse with music21
    print("Parsing MIDI with music21...")
    score = music21.converter.parse(temp_mid)
    
    # Export to MusicXML
    temp_xml = "temp_score.musicxml"
    score.write("musicxml", fp=temp_xml)
    print("Exported MusicXML with music21. Length:")
    with open(temp_xml, "r", encoding="utf-8") as f:
        xml_content = f.read()
    print(len(xml_content))
    print("Snippet:")
    print("\n".join(xml_content.split("\n")[:40]))
    
    # Cleanup
    if os.path.exists(temp_mid): os.remove(temp_mid)
    if os.path.exists(temp_xml): os.remove(temp_xml)

if __name__ == "__main__":
    run()
