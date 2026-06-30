# test_musicxml.py
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
    import analyze
finally:
    sys.stderr = old_stderr

def build_musicxml(treble_notes, bass_notes, time_sig, tempo, key_sig):
    # Time signature beats
    ts_parts = time_sig.split('/')
    num_beats = int(ts_parts[0]) if len(ts_parts) > 0 else 4
    beat_value = int(ts_parts[1]) if len(ts_parts) > 1 else 4
    capacity_beats = (num_beats / beat_value) * 4.0
    
    # We will segment both lists into measures
    def segment_into_measures(notes_list):
        measures = []
        current_m = []
        current_beats = 0.0
        
        def get_note_beats(n):
            if "beats" in n:
                return n["beats"]
            dur = n["duration"]
            if dur.startswith("w"): return 4.0
            if dur.startswith("h"): return 3.0 if "d" in dur else 2.0
            if dur.startswith("q"): return 1.5 if "d" in dur else 1.0
            if dur.startswith("8"): return 0.75 if "d" in dur else 0.5
            return 1.0
            
        for n in notes_list:
            nb = get_note_beats(n)
            if current_beats + nb <= capacity_beats + 0.01:
                current_m.append(n)
                current_beats += nb
            else:
                # pad remaining
                rem = capacity_beats - current_beats
                while rem >= 0.49:
                    if rem >= 4.0:
                        current_m.append({"pitch": "rest", "duration": "wr", "beats": 4.0})
                        rem -= 4.0
                    elif rem >= 3.0:
                        current_m.append({"pitch": "rest", "duration": "hrd", "beats": 3.0})
                        rem -= 3.0
                    elif rem >= 2.0:
                        current_m.append({"pitch": "rest", "duration": "hr", "beats": 2.0})
                        rem -= 2.0
                    elif rem >= 1.5:
                        current_m.append({"pitch": "rest", "duration": "qrd", "beats": 1.5})
                        rem -= 1.5
                    elif rem >= 1.0:
                        current_m.append({"pitch": "rest", "duration": "qr", "beats": 1.0})
                        rem -= 1.0
                    else:
                        current_m.append({"pitch": "rest", "duration": "8r", "beats": 0.5})
                        rem -= 0.5
                measures.append(current_m)
                current_m = [n]
                current_beats = nb
                
        if current_m:
            rem = capacity_beats - current_beats
            while rem >= 0.49:
                if rem >= 4.0:
                    current_m.append({"pitch": "rest", "duration": "wr", "beats": 4.0})
                    rem -= 4.0
                elif rem >= 3.0:
                    current_m.append({"pitch": "rest", "duration": "hrd", "beats": 3.0})
                    rem -= 3.0
                elif rem >= 2.0:
                    current_m.append({"pitch": "rest", "duration": "hr", "beats": 2.0})
                    rem -= 2.0
                elif rem >= 1.5:
                    current_m.append({"pitch": "rest", "duration": "qrd", "beats": 1.5})
                    rem -= 1.5
                elif rem >= 1.0:
                    current_m.append({"pitch": "rest", "duration": "qr", "beats": 1.0})
                    rem -= 1.0
                else:
                    current_m.append({"pitch": "rest", "duration": "8r", "beats": 0.5})
                    rem -= 0.5
            measures.append(current_m)
        return measures

    treble_measures = segment_into_measures(treble_notes)
    bass_measures = segment_into_measures(bass_notes)
    num_measures = max(len(treble_measures), len(bass_measures))
    
    # Key signature fifths mapping
    # maps key name to number of sharps (+) or flats (-)
    key_fifths = {
        "C": 0, "G": 1, "D": 2, "A": 3, "E": 4, "B": 5, "F#": 6, "C#": 7,
        "F": -1, "Bb": -2, "Eb": -3, "Ab": -4, "Db": -5, "Gb": -6, "Cb": -7,
        "a": 0, "e": 1, "b": 2, "f#": 3, "c#": 4, "g#": 5, "d#": 6, "a#": 7,
        "d": -1, "g": -2, "c": -3, "f": -4, "bb": -5, "eb": -6, "ab": -7
    }
    fifths = key_fifths.get(key_sig, 0)
    mode = "minor" if key_sig[0].islower() else "major"
    
    # XML Header
    xml = []
    xml.append('<?xml version="1.0" encoding="UTF-8" standalone="no"?>')
    xml.append('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">')
    xml.append('<score-partwise version="4.0">')
    xml.append('  <work><work-title>Transcribed Score</work-title></work>')
    xml.append('  <part-list>')
    xml.append('    <score-part id="P1"><part-name>Piano</part-name></score-part>')
    xml.append('  </part-list>')
    xml.append('  <part id="P1">')
    
    def parse_pitch(p_str):
        # e.g. Bb1 -> step=B, accidental=flat, octave=1
        if len(p_str) < 2: return None
        step = p_str[0].upper()
        octave = int(p_str[-1]) if p_str[-1].isdigit() else 4
        acc = ""
        if len(p_str) > 2 and p_str[1] in ["#", "b"]:
            acc = "flat" if p_str[1] == "b" else "sharp"
        elif len(p_str) == 2 and p_str[1] not in ["#", "b"] and not p_str[1].isdigit():
            # edge case
            pass
        elif len(p_str) > 2 and not p_str[-1].isdigit():
            # another edge case
            pass
        # Check if middle contains accidental
        for char in p_str[1:-1]:
            if char == "b": acc = "flat"
            elif char == "#": acc = "sharp"
        return step, acc, octave

    def get_type_string(beats):
        if beats >= 4.0: return "whole", False
        if beats >= 3.0: return "half", True
        if beats >= 2.0: return "half", False
        if beats >= 1.5: return "quarter", True
        if beats >= 1.0: return "quarter", False
        if beats >= 0.75: return "eighth", True
        if beats >= 0.5: return "eighth", False
        return "16th", False

    for m_idx in range(num_measures):
        xml.append(f'    <measure number="{m_idx + 1}">')
        if m_idx == 0:
            xml.append('      <attributes>')
            xml.append('        <divisions>4</divisions>')
            xml.append(f'        <key><fifths>{fifths}</fifths><mode>{mode}</mode></key>')
            xml.append(f'        <time><beats>{num_beats}</beats><beat-type>{beat_value}</beat-type></time>')
            xml.append('        <staves>2</staves>')
            xml.append('        <clef number="1"><sign>G</sign><line>2</line></clef>')
            xml.append('        <clef number="2"><sign>F</sign><line>4</line></clef>')
            xml.append('      </attributes>')
            # Add tempo direction
            xml.append('      <direction placement="above">')
            xml.append('        <direction-type>')
            xml.append(f'          <metronome><beat-unit>quarter</beat-unit><per-minute>{int(tempo)}</per-minute></metronome>')
            xml.append('        </direction-type>')
            xml.append('        <sound tempo="%d"/>' % int(tempo))
            xml.append('      </direction>')

        # Process treble staves (staff 1)
        tr_m = treble_measures[m_idx] if m_idx < len(treble_measures) else [{"pitch": "rest", "duration": "wr", "beats": capacity_beats}]
        for note in tr_m:
            nb = note.get("beats", 1.0)
            dur = int(nb * 4)
            type_str, is_dotted = get_type_string(nb)
            
            if note["pitch"] == "rest":
                xml.append('      <note>')
                xml.append('        <rest/>')
                xml.append(f'        <duration>{dur}</duration>')
                xml.append('        <voice>1</voice>')
                xml.append(f'        <type>{type_str}</type>')
                if is_dotted: xml.append('        <dot/>')
                xml.append('        <staff>1</staff>')
                xml.append('      </note>')
            else:
                pitches = note["pitch"].split(",")
                for p_idx, p in enumerate(pitches):
                    parsed = parse_pitch(p)
                    if not parsed: continue
                    step, acc, octave = parsed
                    xml.append('      <note>')
                    if p_idx > 0:
                        xml.append('        <chord/>')
                    xml.append('        <pitch>')
                    xml.append(f'          <step>{step}</step>')
                    if acc == "flat": xml.append('          <alter>-1</alter>')
                    elif acc == "sharp": xml.append('          <alter>1</alter>')
                    xml.append(f'          <octave>{octave}</octave>')
                    xml.append('        </pitch>')
                    xml.append(f'        <duration>{dur}</duration>')
                    xml.append('        <voice>1</voice>')
                    xml.append(f'        <type>{type_str}</type>')
                    if is_dotted: xml.append('        <dot/>')
                    if acc: xml.append(f'        <accidental>{acc}</accidental>')
                    xml.append('        <staff>1</staff>')
                    xml.append('      </note>')
                    
        # Backup step to go back to the beginning of measure for bass staff
        # division total beats * 4
        backup_duration = int(capacity_beats * 4)
        xml.append('      <backup>')
        xml.append(f'        <duration>{backup_duration}</duration>')
        xml.append('      </backup>')

        # Process bass staves (staff 2)
        bs_m = bass_measures[m_idx] if m_idx < len(bass_measures) else [{"pitch": "rest", "duration": "wr", "beats": capacity_beats}]
        for note in bs_m:
            nb = note.get("beats", 1.0)
            dur = int(nb * 4)
            type_str, is_dotted = get_type_string(nb)
            
            if note["pitch"] == "rest":
                xml.append('      <note>')
                xml.append('        <rest/>')
                xml.append(f'        <duration>{dur}</duration>')
                xml.append('        <voice>5</voice>')
                xml.append(f'        <type>{type_str}</type>')
                if is_dotted: xml.append('        <dot/>')
                xml.append('        <staff>2</staff>')
                xml.append('      </note>')
            else:
                pitches = note["pitch"].split(",")
                for p_idx, p in enumerate(pitches):
                    parsed = parse_pitch(p)
                    if not parsed: continue
                    step, acc, octave = parsed
                    xml.append('      <note>')
                    if p_idx > 0:
                        xml.append('        <chord/>')
                    xml.append('        <pitch>')
                    xml.append(f'          <step>{step}</step>')
                    if acc == "flat": xml.append('          <alter>-1</alter>')
                    elif acc == "sharp": xml.append('          <alter>1</alter>')
                    xml.append(f'          <octave>{octave}</octave>')
                    xml.append('        </pitch>')
                    xml.append(f'        <duration>{dur}</duration>')
                    xml.append('        <voice>5</voice>')
                    xml.append(f'        <type>{type_str}</type>')
                    if is_dotted: xml.append('        <dot/>')
                    if acc: xml.append(f'        <accidental>{acc}</accidental>')
                    xml.append('        <staff>2</staff>')
                    xml.append('      </note>')

        xml.append('    </measure>')

    xml.append('  </part>')
    xml.append('</score-partwise>')
    return "\n".join(xml)

def run():
    res = analyze.analyze_audio("tyler.wav")
    xml_str = build_musicxml(res["treble_notes"], res["bass_notes"], res["time_signature"], res["detected_tempo"], res["notes"][0].get("key_signature", "C"))
    print("MusicXML generated! Length:", len(xml_str))
    print("Snippet:")
    print("\n".join(xml_str.split("\n")[:45]))

if __name__ == "__main__":
    run()
