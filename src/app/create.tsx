import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  StyleSheet,
  Alert,
  BackHandler,
  PanResponder,
  Animated,
} from 'react-native';
import Modal from '@/components/PortalModal';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import SheetMusic from '@/components/sheetMusic';
import PlaybackController from '@/components/PlaybackController';
import { parseNote, getBeatsPerMeasure } from '@/components/sheetMusicShared';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { useAudioPlayer } from 'expo-audio';


type Staff = {
  id: string;
  clef: 'treble' | 'bass' | 'alto' | 'tenor';
  measures: any[];
};

type FormattedText = {
  text: string;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  x?: number;
  y?: number;
};

type Score = {
  title: FormattedText;
  author: FormattedText;
  tempo: number;
  keySignature: string;
  timeSignature: string;
  staves: Staff[];
};

const KEY_SIGNATURES: Record<string, { fifths: number; mode: string }> = {
  'C Major': { fifths: 0, mode: 'major' },
  'G Major': { fifths: 1, mode: 'major' },
  'D Major': { fifths: 2, mode: 'major' },
  'A Major': { fifths: 3, mode: 'major' },
  'E Major': { fifths: 4, mode: 'major' },
  'B Major': { fifths: 5, mode: 'major' },
  'F Major': { fifths: -1, mode: 'major' },
  'Bb Major': { fifths: -2, mode: 'major' },
  'Eb Major': { fifths: -3, mode: 'major' },
  'Ab Major': { fifths: -4, mode: 'major' },
  'A minor': { fifths: 0, mode: 'minor' },
  'E minor': { fifths: 1, mode: 'minor' },
  'B minor': { fifths: 2, mode: 'minor' },
  'F# minor': { fifths: 3, mode: 'minor' },
  'C# minor': { fifths: 4, mode: 'minor' },
  'G# minor': { fifths: 5, mode: 'minor' },
  'D minor': { fifths: -1, mode: 'minor' },
  'G minor': { fifths: -2, mode: 'minor' },
  'C minor': { fifths: -3, mode: 'minor' },
  'F minor': { fifths: -4, mode: 'minor' },
};

const CLEF_MAP = {
  treble: { sign: 'G', line: 2 },
  bass: { sign: 'F', line: 4 },
  alto: { sign: 'C', line: 3 },
  tenor: { sign: 'C', line: 4 },
};

const TIME_SIGNATURES = [
  '2/4',
  '3/4',
  '4/4',
  '5/4',
  '6/8',
  '9/8',
  '12/8',
];

function getKeySignatureAlterations(fifths: number): Record<string, number> {
  const sharps = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  const flats = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
  const alters: Record<string, number> = {};
  if (fifths > 0) {
    for (let i = 0; i < Math.min(fifths, 7); i++) {
      alters[sharps[i]] = 1;
    }
  } else if (fifths < 0) {
    for (let i = 0; i < Math.min(Math.abs(fifths), 7); i++) {
      alters[flats[i]] = -1;
    }
  }
  return alters;
}

function generateMusicXML(score: Score) {
  const [beatsStr, beatTypeStr] = score.timeSignature.split('/');
  const beats = parseInt(beatsStr) || 4;
  const beatType = parseInt(beatTypeStr) || 4;
  const keyInfo = KEY_SIGNATURES[score.keySignature] || { fifths: 0, mode: 'major' };
  const measureDuration = Math.round(beats * 256 * (4 / beatType));

  // Partition score.staves into parts based on adjacent Treble and Bass staves (Grand Staff pairing)
  const parts: Staff[][] = [];
  for (let i = 0; i < score.staves.length; i++) {
    if (i < score.staves.length - 1 && score.staves[i].clef === 'treble' && score.staves[i+1].clef === 'bass') {
      parts.push([score.staves[i], score.staves[i+1]]);
      i++;
    } else {
      parts.push([score.staves[i]]);
    }
  }

  let partListXml = '';
  parts.forEach((partStaves, pIdx) => {
    partListXml += `
    <score-part id="P${pIdx + 1}">
      <part-name>Music ${pIdx + 1}</part-name>
    </score-part>`;
  });

  let partsXml = '';
  const numMeasures = score.staves.length > 0 ? score.staves[0].measures.length : 0;

  parts.forEach((partStaves, pIdx) => {
    let partXml = '';
    for (let m = 0; m < numMeasures; m++) {
      let measureXml = '';

      // Include attributes on first measure of each part
      if (m === 0) {
        let attributesXml = `
          <divisions>256</divisions>
          <key>
            <fifths>${keyInfo.fifths}</fifths>
            <mode>${keyInfo.mode}</mode>
          </key>
          <time>
            <beats>${beats}</beats>
            <beat-type>${beatType}</beat-type>
          </time>
        `;
        attributesXml += `<staves>${partStaves.length}</staves>`;

        // Output clefs for all staves in this part
        partStaves.forEach((staff, localIdx) => {
          const clefInfo = CLEF_MAP[staff.clef] || CLEF_MAP.treble;
          attributesXml += `
            <clef number="${localIdx + 1}">
              <sign>${clefInfo.sign}</sign>
              <line>${clefInfo.line}</line>
            </clef>`;
        });

        measureXml += `
           <attributes>
             ${attributesXml}
           </attributes>`;

        // Metronome direction only on the first part's first measure
        if (pIdx === 0) {
          measureXml += `
            <direction directive="yes">
              <direction-type>
                <metronome parenthesized="no">
                  <beat-unit>quarter</beat-unit>
                  <per-minute>${score.tempo}</per-minute>
                </metronome>
              </direction-type>
              <staff>1</staff>
              <sound tempo="${score.tempo}"/>
            </direction>`;
        }
      }

      // Generate notes for each staff of this part
      partStaves.forEach((staff, localIdx) => {
        const voice = localIdx * 4 + 1;
        let staffNotesXml = '';

        if (staff.measures[m] && staff.measures[m].notes && staff.measures[m].notes.length > 0) {
          staff.measures[m].notes.forEach((note: any, noteIdx: number) => {
            const noteId = note.id || `n_${staff.id}_m${m}_${noteIdx}`;
            if (note.isRest) {
              staffNotesXml += `
                <note id="${noteId}">
                  <rest/>
                  <duration>${note.duration}</duration>
                  <voice>${voice}</voice>
                  <type>${note.type}</type>
                  ${note.dot ? '<dot/>' : ''}
                  <staff>${localIdx + 1}</staff>
                </note>`;
            } else {
              const notePitches = note.pitches && note.pitches.length > 0 ? note.pitches : [note.pitch || 'C4'];
              notePitches.forEach((pitchStr: string, pIdx: number) => {
                const match = pitchStr.match(/^([A-G])([#bn]?)(-?\d+)$/);
                let step = 'C';
                let alter = '';
                let accidentalXml = '';
                let octave = '4';
                if (match) {
                  step = match[1];
                  const acc = match[2] || '';
                  octave = match[3];
                  if (acc === '#') {
                    alter = '<alter>1</alter>';
                    accidentalXml = '<accidental>sharp</accidental>';
                  } else if (acc === 'b') {
                    alter = '<alter>-1</alter>';
                    accidentalXml = '<accidental>flat</accidental>';
                  } else if (acc === 'n') {
                    alter = '<alter>0</alter>';
                    accidentalXml = '<accidental>natural</accidental>';
                  } else {
                    const keyAlters = getKeySignatureAlterations(keyInfo.fifths);
                    const keyAlter = keyAlters[step];
                    if (keyAlter === 1) {
                      alter = '<alter>1</alter>';
                    } else if (keyAlter === -1) {
                      alter = '<alter>-1</alter>';
                    }
                  }
                }
                
                const chordXml = pIdx > 0 ? '<chord/>' : '';
                let beamsXml = '';
                if (pIdx === 0 && note.beams && note.beams.length > 0) {
                  note.beams.forEach((beamType: string, bIdx: number) => {
                    beamsXml += `<beam number="${bIdx + 1}">${beamType}</beam>`;
                  });
                }
                
                let tieTag = '';
                let notationsTag = '';
                let noteTie: 'start' | 'stop' | 'both' | undefined;
                if (note.ties && Array.isArray(note.ties)) {
                  noteTie = note.ties[pIdx];
                } else if (pIdx === 0) {
                  noteTie = note.tie;
                }

                if (noteTie === 'start') {
                  tieTag = '<tie type="start"/>';
                  notationsTag = '<notations><tied type="start"/></notations>';
                } else if (noteTie === 'stop') {
                  tieTag = '<tie type="stop"/>';
                  notationsTag = '<notations><tied type="stop"/></notations>';
                } else if (noteTie === 'both') {
                  tieTag = '<tie type="stop"/><tie type="start"/>';
                  notationsTag = '<notations><tied type="stop"/><tied type="start"/></notations>';
                }

                staffNotesXml += `
                  <note id="${noteId}${pIdx > 0 ? `_c${pIdx}` : ''}">
                    ${chordXml}
                    <pitch>
                      <step>${step}</step>
                      ${alter}
                      <octave>${octave}</octave>
                    </pitch>
                    <duration>${note.duration}</duration>
                    ${tieTag}
                    <voice>${voice}</voice>
                    <type>${note.type}</type>
                    ${note.dot ? '<dot/>' : ''}
                    ${accidentalXml}
                    ${beamsXml}
                    ${notationsTag}
                    <staff>${localIdx + 1}</staff>
                  </note>`;
              });
            }
          });
        } else {
          staffNotesXml += `
            <note id="n_${staff.id}_m${m}_fb">
              <rest/>
              <duration>${measureDuration}</duration>
              <voice>${voice}</voice>
              <staff>${localIdx + 1}</staff>
            </note>`;
        }

        measureXml += staffNotesXml;

        if (localIdx < partStaves.length - 1) {
          measureXml += `
            <backup>
              <duration>${measureDuration}</duration>
            </backup>`;
        }
      });

      partXml += `
        <measure number="${m + 1}">
          ${measureXml}
        </measure>`;
    }

    partsXml += `
      <part id="P${pIdx + 1}">
        ${partXml}
      </part>`;
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC
    "-//Recordare//DTD MusicXML 4.0 Partwise//EN"
    "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list>
    ${partListXml}
  </part-list>
  ${partsXml}
</score-partwise>`;
}

const getFontFamily = (family: string) => {
  switch (family.toLowerCase()) {
    case 'serif':
      return Platform.OS === 'ios' ? 'Georgia' : 'serif';
    case 'sans-serif':
      return Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif';
    case 'monospace':
      return Platform.OS === 'ios' ? 'Courier' : 'monospace';
    default:
      return Platform.OS === 'ios' ? 'System' : 'normal';
  }
};

const NOTE_TYPE_BASE_DURS: Record<string, number> = {
  'whole': 1024,
  'half': 512,
  'quarter': 256,
  'eighth': 128,
  '16th': 64,
};

function getMeasureMaxDuration(timeSignature: string, divisions: number = 256): number {
  const [beatsStr, beatTypeStr] = timeSignature.split('/');
  const beats = parseInt(beatsStr) || 4;
  const beatType = parseInt(beatTypeStr) || 4;
  return Math.round(beats * divisions * (4 / beatType));
}

function getFillerRests(remaining: number): any[] {
  const fillers = [
    { type: 'whole', duration: 1024, dot: false },
    { type: 'half', duration: 768, dot: true },
    { type: 'half', duration: 512, dot: false },
    { type: 'quarter', duration: 384, dot: true },
    { type: 'quarter', duration: 256, dot: false },
    { type: 'eighth', duration: 192, dot: true },
    { type: 'eighth', duration: 128, dot: false },
    { type: '16th', duration: 64, dot: false },
  ];
  
  const result: any[] = [];
  let temp = remaining;
  for (const filler of fillers) {
    while (temp >= filler.duration) {
      result.push({
        id: 'auto_' + Math.random().toString(36).substr(2, 9),
        pitch: 'rest',
        isRest: true,
        type: filler.type,
        duration: filler.duration,
        dot: filler.dot,
        isAutoGenerated: true,
      });
      temp -= filler.duration;
    }
  }
  return result;
}

function recalculateMeasureRests(notes: any[], timeSignature: string): any[] {
  const maxDur = getMeasureMaxDuration(timeSignature);
  const userNotes = (notes || []).filter(n => !n.isAutoGenerated);
  
  while (userNotes.length > 0 && userNotes[userNotes.length - 1].isRest) {
    userNotes.pop();
  }
  
  let userDur = 0;
  const validUserNotes = [];
  for (const note of userNotes) {
    if (userDur + note.duration <= maxDur) {
      validUserNotes.push(note);
      userDur += note.duration;
    }
  }
  
  const remaining = maxDur - userDur;
  const fillers = getFillerRests(remaining);
  return [...validUserNotes, ...fillers];
}

function getInitialMeasures(numMeasures: number, timeSignature: string) {
  const maxDur = getMeasureMaxDuration(timeSignature);
  return Array.from({ length: numMeasures }, () => ({
    id: 'm_' + Math.random().toString(36).substr(2, 9),
    notes: getFillerRests(maxDur),
  }));
}

function generateSingleMeasureXML(score: Score, measureIndex: number): string {
  const [beatsStr, beatTypeStr] = score.timeSignature.split('/');
  const beats = parseInt(beatsStr) || 4;
  const beatType = parseInt(beatTypeStr) || 4;
  const keyInfo = KEY_SIGNATURES[score.keySignature] || { fifths: 0, mode: 'major' };
  const measureDuration = Math.round(beats * 256 * (4 / beatType));

  const numMeasures = score.staves.length > 0 ? score.staves[0].measures.length : 1;
  const localMeasureIndex = numMeasures > 0 ? measureIndex % numMeasures : 0;

  // Partition score.staves into parts based on adjacent Treble and Bass staves (Grand Staff pairing)
  const parts: Staff[][] = [];
  for (let i = 0; i < score.staves.length; i++) {
    if (i < score.staves.length - 1 && score.staves[i].clef === 'treble' && score.staves[i+1].clef === 'bass') {
      parts.push([score.staves[i], score.staves[i+1]]);
      i++;
    } else {
      parts.push([score.staves[i]]);
    }
  }

  let partListXml = '';
  parts.forEach((partStaves, pIdx) => {
    partListXml += `
    <score-part id="P${pIdx + 1}">
      <part-name>Music ${pIdx + 1}</part-name>
    </score-part>`;
  });

  let partsXml = '';
  parts.forEach((partStaves, pIdx) => {
    let partXml = '';
    let measureXml = '';
    
    let clefsXml = '';
    partStaves.forEach((staff, localIdx) => {
      const clefInfo = CLEF_MAP[staff.clef] || CLEF_MAP.treble;
      clefsXml += `
        <clef number="${localIdx + 1}">
          <sign>${clefInfo.sign}</sign>
          <line>${clefInfo.line}</line>
        </clef>`;
    });

    measureXml += `
      <attributes>
        <divisions>256</divisions>
        <key>
          <fifths>${keyInfo.fifths}</fifths>
          <mode>${keyInfo.mode}</mode>
        </key>
        <time>
          <beats>${beats}</beats>
          <beat-type>${beatType}</beat-type>
        </time>
        <staves>${partStaves.length}</staves>${clefsXml}
      </attributes>`;

    // Metronome direction only on the first part
    if (pIdx === 0) {
      measureXml += `
        <direction directive="yes">
          <direction-type>
            <metronome parenthesized="no">
              <beat-unit>quarter</beat-unit>
              <per-minute>${score.tempo}</per-minute>
            </metronome>
          </direction-type>
          <staff>1</staff>
          <sound tempo="${score.tempo}"/>
        </direction>`;
    }

    partStaves.forEach((staff, localIdx) => {
      const voice = localIdx * 4 + 1;
      let staffNotesXml = '';
      
      if (staff.measures[localMeasureIndex] && staff.measures[localMeasureIndex].notes && staff.measures[localMeasureIndex].notes.length > 0) {
        staff.measures[localMeasureIndex].notes.forEach((note: any, noteIdx: number) => {
          const noteId = note.id || `n_${staff.id}_m${measureIndex}_${noteIdx}`;
          if (note.isRest) {
            staffNotesXml += `
              <note id="${noteId}">
                <rest/>
                <duration>${note.duration}</duration>
                <voice>${voice}</voice>
                <type>${note.type}</type>
                ${note.dot ? '<dot/>' : ''}
                <staff>${localIdx + 1}</staff>
              </note>`;
          } else {
            const notePitches = note.pitches && note.pitches.length > 0 ? note.pitches : [note.pitch || 'C4'];
            notePitches.forEach((pitchStr: string, pIdx: number) => {
              const match = pitchStr.match(/^([A-G])([#bn]?)(-?\d+)$/);
              let step = 'C';
              let alter = '';
              let accidentalXml = '';
              let octave = '4';
              if (match) {
                step = match[1];
                const acc = match[2] || '';
                octave = match[3];
                if (acc === '#') {
                  alter = '<alter>1</alter>';
                  accidentalXml = '<accidental>sharp</accidental>';
                } else if (acc === 'b') {
                  alter = '<alter>-1</alter>';
                  accidentalXml = '<accidental>flat</accidental>';
                } else if (acc === 'n') {
                  alter = '<alter>0</alter>';
                  accidentalXml = '<accidental>natural</accidental>';
                } else {
                  // Default accidental: check key signature
                  const keyAlters = getKeySignatureAlterations(keyInfo.fifths);
                  const keyAlter = keyAlters[step];
                  if (keyAlter === 1) {
                    alter = '<alter>1</alter>';
                  } else if (keyAlter === -1) {
                    alter = '<alter>-1</alter>';
                  }
                }
              }

              const chordXml = pIdx > 0 ? '<chord/>' : '';

              let beamsXml = '';
              if (pIdx === 0 && note.beams && note.beams.length > 0) {
                note.beams.forEach((beamType: string, bIdx: number) => {
                  beamsXml += `<beam number="${bIdx + 1}">${beamType}</beam>`;
                });
              }

              let tieTag = '';
              let notationsTag = '';
              let noteTie: 'start' | 'stop' | 'both' | undefined;
              if (note.ties && Array.isArray(note.ties)) {
                noteTie = note.ties[pIdx];
              } else if (pIdx === 0) {
                noteTie = note.tie;
              }

              if (noteTie === 'start') {
                tieTag = '<tie type="start"/>';
                notationsTag = '<notations><tied type="start"/></notations>';
              } else if (noteTie === 'stop') {
                tieTag = '<tie type="stop"/>';
                notationsTag = '<notations><tied type="stop"/></notations>';
              } else if (noteTie === 'both') {
                tieTag = '<tie type="stop"/><tie type="start"/>';
                notationsTag = '<notations><tied type="stop"/><tied type="start"/></notations>';
              }

              staffNotesXml += `
                <note id="${noteId}${pIdx > 0 ? `_c${pIdx}` : ''}">
                  ${chordXml}
                  <pitch>
                    <step>${step}</step>
                    ${alter}
                    <octave>${octave}</octave>
                  </pitch>
                  <duration>${note.duration}</duration>
                  ${tieTag}
                  <voice>${voice}</voice>
                  <type>${note.type}</type>
                  ${note.dot ? '<dot/>' : ''}
                  ${accidentalXml}
                  ${beamsXml}
                  ${notationsTag}
                  <staff>${localIdx + 1}</staff>
                </note>`;
            });
          }
        });
      } else {
        staffNotesXml += `
          <note id="n_${staff.id}_m${measureIndex}_fb">
            <rest/>
            <duration>${measureDuration}</duration>
            <voice>${voice}</voice>
            <staff>${localIdx + 1}</staff>
          </note>`;
      }
      
      measureXml += staffNotesXml;

      if (localIdx < partStaves.length - 1) {
        measureXml += `
          <backup>
            <duration>${measureDuration}</duration>
          </backup>`;
      }
    });

    partXml += `
      <measure number="1">
        ${measureXml}
      </measure>`;
    
    partsXml += `
      <part id="P${pIdx + 1}">
        ${partXml}
      </part>`;
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC
    "-//Recordare//DTD MusicXML 4.0 Partwise//EN"
    "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>Measure ${measureIndex + 1}</work-title>
  </work>
  <part-list>
    ${partListXml}
  </part-list>
  ${partsXml}
</score-partwise>`;
}

const PITCH_OFFSETS: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};

const MIDI_PITCHES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MIDI_PITCHES_FLAT  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function pitchToMidi(pitchStr: string, fifths: number = 0): number {
  const match = pitchStr.match(/^([A-G])([#bn]?)(-?\d+)$/);
  if (!match) return 60; // middle C default
  const step = match[1];
  const acc = match[2] || '';
  const octave = parseInt(match[3]) || 4;

  const stepToSemitone: Record<string, number> = {
    'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
  };

  let semitone = stepToSemitone[step];
  if (acc === '#') {
    semitone += 1;
  } else if (acc === 'b') {
    semitone -= 1;
  } else if (acc === 'n') {
    // Natural: no alteration
  } else {
    // Apply key signature alteration
    const keyAlters = getKeySignatureAlterations(fifths);
    const keyAlter = keyAlters[step];
    if (keyAlter === 1) {
      semitone += 1;
    } else if (keyAlter === -1) {
      semitone -= 1;
    }
  }

  return (octave + 1) * 12 + semitone;
}

function midiToPitch(midi: number, preferFlat: boolean = false): string {
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  const list = preferFlat ? MIDI_PITCHES_FLAT : MIDI_PITCHES_SHARP;
  const stepAndAcc = list[noteIndex];
  return `${stepAndAcc}${octave}`;
}

const hasGrandStaffPair = (staves: Staff[]) => {
  for (let i = 0; i < staves.length - 1; i++) {
    if (staves[i].clef === 'treble' && staves[i+1].clef === 'bass') {
      return true;
    }
  }
  return false;
};

const NOTE_OPTIONS = [
  { label: 'Whole', value: 'whole', symbol: '𝅝' },
  { label: 'Half', value: 'half', symbol: '𝅗𝅥' },
  { label: 'Quarter', value: 'quarter', symbol: '♩' },
  { label: 'Eighth', value: 'eighth', symbol: '♪' },
  { label: 'Sixteenth', value: '16th', symbol: '𝅘𝅥𝅯' },
];

const REST_OPTIONS = [
  { label: 'Whole Rest', value: 'whole', symbol: '𝄻' },
  { label: 'Half Rest', value: 'half', symbol: '𝄼' },
  { label: 'Quarter Rest', value: 'quarter', symbol: '𝄽' },
  { label: 'Eighth Rest', value: 'eighth', symbol: '𝄾' },
  { label: 'Sixteenth Rest', value: '16th', symbol: '𝄿' },
];
const shiftPitchDiatonically = (pitch: string, direction: 'up' | 'down'): string => {
  const match = pitch.match(/^([A-G])([#bn]?)(-?\d+)$/);
  if (!match) return pitch;
  
  const step = match[1];
  const accidental = match[2];
  let octave = parseInt(match[3]);
  
  const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  let stepIdx = STEPS.indexOf(step);
  if (stepIdx === -1) return pitch;
  
  if (direction === 'up') {
    if (step === 'B') {
      stepIdx = 0;
      octave += 1;
    } else {
      stepIdx += 1;
    }
  } else {
    if (step === 'C') {
      stepIdx = 6;
      octave -= 1;
    } else {
      stepIdx -= 1;
    }
  }
  
  return `${STEPS[stepIdx]}${accidental}${octave}`;
};

const findNoteInScore = (scoreVal: Score, targetNoteId: string) => {
  for (let sIdx = 0; sIdx < scoreVal.staves.length; sIdx++) {
    const staff = scoreVal.staves[sIdx];
    for (let mIdx = 0; mIdx < staff.measures.length; mIdx++) {
      const measure = staff.measures[mIdx];
      const notes = measure.notes || [];
      for (let nIdx = 0; nIdx < notes.length; nIdx++) {
        const note = notes[nIdx];
        const noteId = note.id || `n_${staff.id}_m${mIdx}_${nIdx}`;
        if (noteId === targetNoteId) {
          return { staffIndex: sIdx, measureIndex: mIdx, noteIndex: nIdx, note: note, pitchIndex: 0 };
        }
        if (targetNoteId.startsWith(noteId + '_c')) {
          const suffix = targetNoteId.substring(noteId.length + 2);
          const pIdx = parseInt(suffix) || 0;
          return { staffIndex: sIdx, measureIndex: mIdx, noteIndex: nIdx, note: note, pitchIndex: pIdx };
        }
      }
    }
  }
  return null;
};


const getStaffNotesList = (scoreVal: Score, staffIndex: number) => {
  const staff = scoreVal.staves[staffIndex];
  if (!staff) return [];
  const list: {
    note: any;
    noteId: string;
    measureIndex: number;
    noteIndex: number;
  }[] = [];
  for (let mIdx = 0; mIdx < staff.measures.length; mIdx++) {
    const measure = staff.measures[mIdx];
    const notes = measure.notes || [];
    for (let nIdx = 0; nIdx < notes.length; nIdx++) {
      const note = notes[nIdx];
      const noteId = note.id || `n_${staff.id}_m${mIdx}_${nIdx}`;
      list.push({ note, noteId, measureIndex: mIdx, noteIndex: nIdx });
    }
  }
  return list;
};

const getNoteTieState = (note: any, pitchIndex: number): 'start' | 'stop' | 'both' | undefined => {
  if (note.ties && Array.isArray(note.ties)) {
    return note.ties[pitchIndex];
  }
  if (pitchIndex === 0) {
    return note.tie;
  }
  return undefined;
};

const setNoteTieState = (note: any, pitchIndex: number, value: 'start' | 'stop' | 'both' | undefined): any => {
  const updatedNote = { ...note };
  if (updatedNote.pitches && updatedNote.pitches.length > 0) {
    const nextTies = Array.isArray(updatedNote.ties)
      ? [...updatedNote.ties]
      : new Array(updatedNote.pitches.length).fill(undefined);
    nextTies[pitchIndex] = value;
    updatedNote.ties = nextTies;
  } else {
    if (value === undefined) {
      delete updatedNote.tie;
    } else {
      updatedNote.tie = value;
    }
  }
  return updatedNote;
};

const combineTieState = (current: 'start' | 'stop' | 'both' | undefined, toAdd: 'start' | 'stop'): 'start' | 'stop' | 'both' => {
  if (!current) return toAdd;
  if (current === 'both') return 'both';
  if (current === toAdd) return toAdd;
  return 'both';
};

const removeTieFromState = (current: 'start' | 'stop' | 'both' | undefined, toRemove: 'start' | 'stop'): 'start' | 'stop' | 'both' | undefined => {
  if (!current) return undefined;
  if (current === 'both') {
    return toRemove === 'start' ? 'stop' : 'start';
  }
  if (current === toRemove) return undefined;
  return current;
};

const breakTiesForNoteHead = (
  scoreVal: Score,
  staffIndex: number,
  measureIndex: number,
  noteIndex: number,
  pitchIndex: number
): Score => {
  const staffNotes = getStaffNotesList(scoreVal, staffIndex);
  const flatIdx = staffNotes.findIndex(
    item => item.measureIndex === measureIndex && item.noteIndex === noteIndex
  );
  if (flatIdx === -1) return scoreVal;
  
  const currentItem = staffNotes[flatIdx];
  const currentNote = currentItem.note;
  if (currentNote.isRest) return scoreVal;
  
  const pitches = currentNote.pitches && currentNote.pitches.length > 0
    ? currentNote.pitches
    : [currentNote.pitch || 'C4'];
  const pIdx = pitchIndex < pitches.length ? pitchIndex : 0;
  const pitchString = pitches[pIdx];
  
  const keyInfo = KEY_SIGNATURES[scoreVal.keySignature] || { fifths: 0, mode: 'major' };
  const currentMidi = pitchToMidi(pitchString, keyInfo.fifths);
  
  const tieState = getNoteTieState(currentNote, pIdx);
  if (!tieState) return scoreVal;
  
  let incomingToBreak: { measureIndex: number; noteIndex: number; pitchIndex: number } | null = null;
  let outgoingToBreak: { measureIndex: number; noteIndex: number; pitchIndex: number } | null = null;
  
  if (tieState === 'stop' || tieState === 'both') {
    if (flatIdx > 0) {
      const prevItem = staffNotes[flatIdx - 1];
      const prevNote = prevItem.note;
      if (!prevNote.isRest) {
        const prevPitches = prevNote.pitches && prevNote.pitches.length > 0
          ? prevNote.pitches
          : [prevNote.pitch || 'C4'];
        
        for (let i = 0; i < prevPitches.length; i++) {
          const prevMidi = pitchToMidi(prevPitches[i], keyInfo.fifths);
          if (prevMidi === currentMidi) {
            const prevTie = getNoteTieState(prevNote, i);
            if (prevTie === 'start' || prevTie === 'both') {
              incomingToBreak = {
                measureIndex: prevItem.measureIndex,
                noteIndex: prevItem.noteIndex,
                pitchIndex: i
              };
              break;
            }
          }
        }
      }
    }
  }
  
  if (tieState === 'start' || tieState === 'both') {
    if (flatIdx < staffNotes.length - 1) {
      const nextItem = staffNotes[flatIdx + 1];
      const nextNote = nextItem.note;
      if (!nextNote.isRest) {
        const nextPitches = nextNote.pitches && nextNote.pitches.length > 0
          ? nextNote.pitches
          : [nextNote.pitch || 'C4'];
          
        for (let i = 0; i < nextPitches.length; i++) {
          const nextMidi = pitchToMidi(nextPitches[i], keyInfo.fifths);
          if (nextMidi === currentMidi) {
            const nextTie = getNoteTieState(nextNote, i);
            if (nextTie === 'stop' || nextTie === 'both') {
              outgoingToBreak = {
                measureIndex: nextItem.measureIndex,
                noteIndex: nextItem.noteIndex,
                pitchIndex: i
              };
              break;
            }
          }
        }
      }
    }
  }
  
  return {
    ...scoreVal,
    staves: scoreVal.staves.map((staff, sIdx) => {
      if (sIdx !== staffIndex) return staff;
      
      return {
        ...staff,
        measures: staff.measures.map((measure, mIdx) => {
          const isCurrentMeasure = mIdx === measureIndex;
          const isIncomingMeasure = incomingToBreak && incomingToBreak.measureIndex === mIdx;
          const isOutgoingMeasure = outgoingToBreak && outgoingToBreak.measureIndex === mIdx;
          
          if (!isCurrentMeasure && !isIncomingMeasure && !isOutgoingMeasure) {
            return measure;
          }
          
          const nextNotes = measure.notes.map((note: any, nIdx: number) => {
            let updatedNote = { ...note };
            
            if (isCurrentMeasure && nIdx === noteIndex) {
              updatedNote = setNoteTieState(updatedNote, pIdx, undefined);
            }
            
            if (isIncomingMeasure && nIdx === incomingToBreak!.noteIndex) {
              const prevIdx = incomingToBreak!.pitchIndex;
              const prevTie = getNoteTieState(updatedNote, prevIdx);
              let nextPrevTie: 'start' | 'stop' | 'both' | undefined = undefined;
              if (prevTie === 'both') {
                nextPrevTie = 'stop';
              }
              updatedNote = setNoteTieState(updatedNote, prevIdx, nextPrevTie);
            }
            
            if (isOutgoingMeasure && nIdx === outgoingToBreak!.noteIndex) {
              const nextIdx = outgoingToBreak!.pitchIndex;
              const nextTie = getNoteTieState(updatedNote, nextIdx);
              let nextNextTie: 'start' | 'stop' | 'both' | undefined = undefined;
              if (nextTie === 'both') {
                nextNextTie = 'start';
              }
              updatedNote = setNoteTieState(updatedNote, nextIdx, nextNextTie);
            }
            
            return updatedNote;
          });
          
          return { ...measure, notes: nextNotes };
        })
      };
    })
  };
};

const breakAllTiesForNote = (
  scoreVal: Score,
  staffIndex: number,
  measureIndex: number,
  noteIndex: number
): Score => {
  const staff = scoreVal.staves[staffIndex];
  if (!staff) return scoreVal;
  const measure = staff.measures[measureIndex];
  if (!measure) return scoreVal;
  const note = measure.notes[noteIndex];
  if (!note || note.isRest) return scoreVal;
  
  const pitchesCount = note.pitches && note.pitches.length > 0 ? note.pitches.length : 1;
  let currentScore = scoreVal;
  for (let pIdx = 0; pIdx < pitchesCount; pIdx++) {
    currentScore = breakTiesForNoteHead(currentScore, staffIndex, measureIndex, noteIndex, pIdx);
  }
  return currentScore;
};

const isTieValid = (scoreVal: Score, noteId1: string, noteId2: string): boolean => {
  const found1 = findNoteInScore(scoreVal, noteId1);
  const found2 = findNoteInScore(scoreVal, noteId2);
  if (!found1 || !found2) return false;
  if (found1.note.isRest || found2.note.isRest) return false;

  // 1. Same voice (same staffIndex)
  if (found1.staffIndex !== found2.staffIndex) return false;

  // 2. Adjacent notes check
  const staffNotes = getStaffNotesList(scoreVal, found1.staffIndex);
  const idx1 = staffNotes.findIndex(
    item => item.measureIndex === found1.measureIndex && item.noteIndex === found1.noteIndex
  );
  const idx2 = staffNotes.findIndex(
    item => item.measureIndex === found2.measureIndex && item.noteIndex === found2.noteIndex
  );
  if (idx1 === -1 || idx2 === -1) return false;
  if (Math.abs(idx1 - idx2) !== 1) return false;

  // 3. Same sounding pitch
  const pitch1 = found1.note.pitches && found1.note.pitches.length > 0
    ? found1.note.pitches[found1.pitchIndex]
    : found1.note.pitch;
  const pitch2 = found2.note.pitches && found2.note.pitches.length > 0
    ? found2.note.pitches[found2.pitchIndex]
    : found2.note.pitch;

  if (!pitch1 || !pitch2) return false;
  
  const keyInfo = KEY_SIGNATURES[scoreVal.keySignature] || { fifths: 0, mode: 'major' };
  if (pitchToMidi(pitch1, keyInfo.fifths) !== pitchToMidi(pitch2, keyInfo.fifths)) return false;

  return true;
};

const isTied = (scoreVal: Score, noteId1: string, noteId2: string): boolean => {
  const found1 = findNoteInScore(scoreVal, noteId1);
  const found2 = findNoteInScore(scoreVal, noteId2);
  if (!found1 || !found2) return false;
  
  let startNode = found1;
  let endNode = found2;
  if (
    found1.measureIndex > found2.measureIndex ||
    (found1.measureIndex === found2.measureIndex && found1.noteIndex > found2.noteIndex)
  ) {
    startNode = found2;
    endNode = found1;
  }
  
  const tie1 = getNoteTieState(startNode.note, startNode.pitchIndex);
  const tie2 = getNoteTieState(endNode.note, endNode.pitchIndex);
  
  const isStart = tie1 === 'start' || tie1 === 'both';
  const isStop = tie2 === 'stop' || tie2 === 'both';
  
  return isStart && isStop;
};

const isBeamConnectionValid = (scoreVal: Score, id1: string, id2: string): boolean => {
  const found1 = findNoteInScore(scoreVal, id1);
  const found2 = findNoteInScore(scoreVal, id2);
  if (!found1 || !found2) return false;

  // 1. Same staff (voice)
  if (found1.staffIndex !== found2.staffIndex) return false;

  // 2. Same measure
  if (found1.measureIndex !== found2.measureIndex) return false;

  // 3. Both must be 8th or 16th non-rest notes
  const n1 = found1.note;
  const n2 = found2.note;
  if (n1.isRest || n2.isRest) return false;
  if (n1.type !== 'eighth' && n1.type !== '16th') return false;
  if (n2.type !== 'eighth' && n2.type !== '16th') return false;

  // 4. Adjacent in the notes array (no notes or rests between)
  if (Math.abs(found1.noteIndex - found2.noteIndex) !== 1) return false;

  return true;
};

const areNotesConnected = (scoreVal: Score, id1: string, id2: string): boolean => {
  const found1 = findNoteInScore(scoreVal, id1);
  const found2 = findNoteInScore(scoreVal, id2);
  if (!found1 || !found2) return false;

  if (!isBeamConnectionValid(scoreVal, id1, id2)) return false;

  let left = found1;
  let right = found2;
  if (found1.noteIndex > found2.noteIndex) {
    left = found2;
    right = found1;
  }

  const leftNote = left.note;
  const rightNote = right.note;

  const leftConnectsRight = leftNote.beams && leftNote.beams.length > 0 && (leftNote.beams[0] === 'begin' || leftNote.beams[0] === 'continue');
  const rightConnectsLeft = rightNote.beams && rightNote.beams.length > 0 && (rightNote.beams[0] === 'end' || rightNote.beams[0] === 'continue');

  return !!(leftConnectsRight && rightConnectsLeft);
};

const cleanInvalidBeams = (notes: any[]): any[] => {
  // Step 1: Filter/sanitize basic beam connection intent.
  // Only eighth and sixteenth notes can have beams. Rests or other durations cannot.
  const conn = notes.map((n, idx) => {
    if (!n || n.isRest || (n.type !== 'eighth' && n.type !== '16th')) {
      return { left: false, right: false };
    }
    const left = n.beams && n.beams.length > 0 && (n.beams[0] === 'end' || n.beams[0] === 'continue');
    const right = n.beams && n.beams.length > 0 && (n.beams[0] === 'begin' || n.beams[0] === 'continue');
    return { left, right };
  });

  // Step 2: Validate adjacency. A connection is only valid if both neighbors agree.
  for (let i = 0; i < conn.length; i++) {
    if (conn[i].left) {
      if (i === 0 || !conn[i - 1].right) {
        conn[i].left = false;
      }
    }
    if (conn[i].right) {
      if (i === conn.length - 1 || !conn[i + 1].left) {
        conn[i].right = false;
      }
    }
  }

  // Step 3: Map connections back to standard beam states.
  return notes.map((n, idx) => {
    if (n.isRest || (n.type !== 'eighth' && n.type !== '16th')) {
      const { beams, ...rest } = n;
      return rest;
    }

    const left = conn[idx].left;
    const right = conn[idx].right;

    if (!left && !right) {
      const { beams, ...rest } = n;
      return rest;
    }

    // Determine beam 1 state
    let beam1: 'begin' | 'continue' | 'end';
    if (left && right) {
      beam1 = 'continue';
    } else if (left) {
      beam1 = 'end';
    } else {
      beam1 = 'begin';
    }

    const beamsArray: ('begin' | 'continue' | 'end' | 'backward hook' | 'forward hook')[] = [beam1];

    // If it's a 16th note, we need beam 2
    if (n.type === '16th') {
      let beam2: 'begin' | 'continue' | 'end' | 'backward hook' | 'forward hook';
      
      const leftIs16th = left && notes[idx - 1] && notes[idx - 1].type === '16th';
      const rightIs16th = right && notes[idx + 1] && notes[idx + 1].type === '16th';

      if (leftIs16th && rightIs16th) {
        beam2 = 'continue';
      } else if (leftIs16th) {
        beam2 = 'end';
      } else if (rightIs16th) {
        beam2 = 'begin';
      } else {
        // Isolated 16th note within the beam group.
        // It must connect to at least one neighbor via beam 1.
        if (left) {
          beam2 = 'backward hook';
        } else {
          beam2 = 'forward hook';
        }
      }
      beamsArray.push(beam2);
    }

    return {
      ...n,
      beams: beamsArray
    };
  });
};

function getPitchParts(pitch: string) {
  const match = pitch.match(/^([A-G])([#bn]?)(-?\d+)$/);
  if (match) {
    return { step: match[1], accidental: match[2], octave: match[3] };
  }
  return { step: 'C', accidental: '', octave: '4' };
}

function reconstructScoreData(project: any): Score {
  const rawNotes = project.convertedNotes || project.notes;
  const timeSig = project.timeSignature || '4/4';
  const tempo = project.detectedTempo || 120;
  const name = project.name || 'Untitled Score';
  const author = 'Unknown Author';

  const beatsPerMeasure = getBeatsPerMeasure(timeSig);
  const maxDur = getMeasureMaxDuration(timeSig);

  let trebleNotes: any[] = [];
  let bassNotes: any[] = [];

  if (project.treble_notes && project.bass_notes && (project.treble_notes.length > 0 || project.bass_notes.length > 0)) {
    trebleNotes = project.treble_notes;
    bassNotes = project.bass_notes;
  } else if (rawNotes) {
    if (!Array.isArray(rawNotes) && rawNotes.treble && rawNotes.bass) {
      trebleNotes = rawNotes.treble;
      bassNotes = rawNotes.bass;
    } else {
      const arr = Array.isArray(rawNotes) ? rawNotes : [];
      arr.forEach((n: any) => {
        if (n.pitch === 'rest') {
          trebleNotes.push(n);
        } else {
          const firstPitch = n.pitch.split(',')[0];
          const parsed = parseNote(firstPitch);
          if (parsed && parsed.clef === 'bass') {
            bassNotes.push(n);
          } else {
            trebleNotes.push(n);
          }
        }
      });
    }
  }

  const mapNoteToEditorFormat = (n: any) => {
    const isRest = n.pitch === 'rest';
    const pitches = isRest ? [] : (n.pitch.includes(',') ? n.pitch.split(',') : [n.pitch]);
    
    let type = 'quarter';
    let duration = 256;
    let dot = false;

    const durStr = String(n.duration).toLowerCase();
    if (durStr.startsWith('w')) {
      type = 'whole';
      duration = 1024;
    } else if (durStr.startsWith('h')) {
      type = 'half';
      duration = 512;
    } else if (durStr.startsWith('q') || durStr.startsWith('quarter') || durStr === '4') {
      type = 'quarter';
      duration = 256;
    } else if (durStr.startsWith('8') || durStr.startsWith('e') || durStr === '8') {
      type = 'eighth';
      duration = 128;
    } else if (durStr.startsWith('16') || durStr.startsWith('s') || durStr === '16') {
      type = '16th';
      duration = 64;
    }

    if (durStr.includes('d') || n.dot) {
      dot = true;
      duration = Math.round(duration * 1.5);
    }

    return {
      id: n.id || 'n_' + Math.random().toString(36).substr(2, 9),
      pitch: isRest ? 'rest' : pitches[0],
      pitches: pitches,
      isRest,
      type,
      duration,
      dot,
      tie: n.tie,
      ties: n.ties,
      beams: n.beams,
    };
  };

  const convertNotesToMeasures = (notesList: any[], clef: string) => {
    const mapped = notesList.map(mapNoteToEditorFormat);
    const measuresList: any[] = [];
    let currentMeasureNotes: any[] = [];
    let currentMeasureDur = 0;

    mapped.forEach((note) => {
      if (currentMeasureDur + note.duration <= maxDur + 4) {
        currentMeasureNotes.push(note);
        currentMeasureDur += note.duration;
      } else {
        const remaining = maxDur - currentMeasureDur;
        if (remaining > 0) {
          currentMeasureNotes.push(...getFillerRests(remaining));
        }
        measuresList.push({
          id: 'm_' + Math.random().toString(36).substr(2, 9),
          notes: currentMeasureNotes,
        });

        currentMeasureNotes = [note];
        currentMeasureDur = note.duration;
      }
    });

    if (currentMeasureNotes.length > 0 || measuresList.length === 0) {
      const remaining = maxDur - currentMeasureDur;
      if (remaining > 0) {
        currentMeasureNotes.push(...getFillerRests(remaining));
      }
      measuresList.push({
        id: 'm_' + Math.random().toString(36).substr(2, 9),
        notes: currentMeasureNotes,
      });
    }

    return measuresList;
  };

  const trebleMeasures = convertNotesToMeasures(trebleNotes, 'treble');
  const bassMeasures = convertNotesToMeasures(bassNotes, 'bass');

  const finalNumMeasures = Math.max(trebleMeasures.length, bassMeasures.length, 4);
  
  const padMeasures = (measuresList: any[]) => {
    const list = [...measuresList];
    while (list.length < finalNumMeasures) {
      list.push({
        id: 'm_' + Math.random().toString(36).substr(2, 9),
        notes: getFillerRests(maxDur),
      });
    }
    return list;
  };

  return {
    title: {
      text: name,
      fontFamily: 'Default',
      fontSize: 28,
      bold: true,
      italic: false,
    },
    author: {
      text: author,
      fontFamily: 'Default',
      fontSize: 16,
      bold: false,
      italic: true,
    },
    tempo: tempo,
    keySignature: project.keySignature || 'C Major',
    timeSignature: timeSig,
    staves: [
      {
        id: '1',
        clef: 'treble',
        measures: padMeasures(trebleMeasures),
      },
      {
        id: '2',
        clef: 'bass',
        measures: padMeasures(bassMeasures),
      },
    ],
  };
}

export interface CreateScreenProps {
  initialProjectId?: string;
  initialNotes?: any;
  initialTimeSignature?: string;
  initialTempo?: number;
  initialMusicXML?: string;
  initialSourceType?: 'manual' | 'transcribed';
  defaultEditMode?: boolean;
  onExit?: () => void;
  measuresPerSystem?: number;
  initialTitle?: string;
  initialAuthor?: string;
  webViewRef?: React.RefObject<any>;
  onWebViewMessage?: (event: any) => void;
  sheetMusicId?: string;
}

export default function CreateScreen(props?: CreateScreenProps) {
  const {
    initialProjectId,
    initialNotes,
    initialTimeSignature,
    initialTempo,
    initialMusicXML,
    initialSourceType,
    defaultEditMode,
    onExit,
    measuresPerSystem = 2,
    initialTitle,
    initialAuthor,
    webViewRef: parentWebViewRef,
    onWebViewMessage,
    sheetMusicId,
  } = props || {};

  const router = useRouter();
  const [editorMode, setEditorMode] = useState<'choice' | 'scratch'>(
    (initialProjectId || initialNotes || initialMusicXML) ? 'scratch' : 'choice'
  );
  const [isEditMode, setIsEditMode] = useState<boolean>(
    defaultEditMode !== undefined ? defaultEditMode : true
  );

  const headerButtonAnim = useRef(new Animated.Value(isEditMode ? 1 : 0)).current;

  // Animate header buttons transition when isEditMode changes
  useEffect(() => {
    Animated.timing(headerButtonAnim, {
      toValue: isEditMode ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isEditMode]);

  const backOpacity = headerButtonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const backScale = headerButtonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.85],
  });

  const exitOpacity = headerButtonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const exitScale = headerButtonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });

  const isInteractingWithToolbar = useRef(false);
  const titleInputRef = useRef<any>(null);
  const authorInputRef = useRef<any>(null);

  // Sync edit mode prop from parent
  useEffect(() => {
    if (defaultEditMode !== undefined) {
      setIsEditMode(defaultEditMode);
    }
  }, [defaultEditMode]);

  // Helper to parse MusicXML to the editor's raw notes format
  const parseMusicXMLToNotes = (xmlStr: string) => {
    const notes: any[] = [];
    const cleanXml = xmlStr.replace(/\s+/g, ' ');
    
    // Find all <note> blocks
    const noteRegex = /<note\b[^>]*>(.*?)<\/note>/g;
    let match;
    
    while ((match = noteRegex.exec(cleanXml)) !== null) {
      const noteContent = match[1];
      const isRest = noteContent.includes('<rest');
      
      let pitch = 'rest';
      if (!isRest) {
        const stepMatch = /<step>([^<]+)<\/step>/.exec(noteContent);
        const octaveMatch = /<octave>([^<]+)<\/octave>/.exec(noteContent);
        const alterMatch = /<alter>([^<]+)<\/alter>/.exec(noteContent);
        
        if (stepMatch && octaveMatch) {
          const step = stepMatch[1].trim();
          const octave = octaveMatch[1].trim();
          
          let alterStr = '';
          if (alterMatch) {
            const alterVal = parseInt(alterMatch[1].trim(), 10);
            if (alterVal === 1) alterStr = '#';
            else if (alterVal === -1) alterStr = 'b';
          }
          pitch = `${step}${alterStr}${octave}`;
        }
      }
      
      // Parse duration type
      const typeMatch = /<type>([^<]+)<\/type>/.exec(noteContent);
      let type = 'quarter'; // default
      if (typeMatch) {
        const xmlType = typeMatch[1].trim().toLowerCase();
        if (xmlType === 'whole') type = 'whole';
        else if (xmlType === 'half') type = 'half';
        else if (xmlType === 'quarter') type = 'quarter';
        else if (xmlType === 'eighth') type = 'eighth';
        else if (xmlType === '16th') type = '16th';
      }
      
      const dot = noteContent.includes('<dot');
      
      notes.push({
        id: 'n_' + Math.random().toString(36).substr(2, 9),
        pitch,
        duration: type,
        dot
      });
    }
    
    console.log(`[create] Parsed ${notes.length} notes from MusicXML.`);
    return notes;
  };

  // Score state (initialized with initial values if provided)
  const [score, setScore] = useState<Score>(() => {
    let notesToUse = initialNotes;

    // Parse MusicXML if initialNotes are not provided directly (Issue 3)
    if (!notesToUse && initialMusicXML) {
      console.log("[create] Parsing initialMusicXML prop into editor score...");
      try {
        notesToUse = parseMusicXMLToNotes(initialMusicXML);
      } catch (err) {
        console.error("[create] Failed to parse MusicXML:", err);
      }
    }

    if (notesToUse) {
      return reconstructScoreData({
        name: initialTitle || 'Untitled Score',
        timeSignature: initialTimeSignature || '4/4',
        detectedTempo: initialTempo || 120,
        convertedNotes: notesToUse,
      });
    }

    const timeSig = initialTimeSignature || '4/4';
    const tempo = initialTempo || 120;
    const titleText = initialTitle || 'Untitled Score';
    const authorText = initialAuthor || 'Unknown Author';

    return {
      title: {
        text: titleText,
        fontFamily: 'Default',
        fontSize: 28,
        bold: true,
        italic: false,
      },
      author: {
        text: authorText,
        fontFamily: 'Default',
        fontSize: 16,
        bold: false,
        italic: true,
      },
      tempo: tempo,
      keySignature: 'C Major',
      timeSignature: timeSig,
      staves: [
        {
          id: '1',
          clef: 'treble',
          measures: getInitialMeasures(4, timeSig),
        },
        {
          id: '2',
          clef: 'bass',
          measures: getInitialMeasures(4, timeSig),
        },
      ],
    };
  });

  const initialScoreRef = useRef<Score | null>(null);

  // Set the initialScoreRef when score is first loaded
  useEffect(() => {
    if (score && !initialScoreRef.current) {
      initialScoreRef.current = JSON.parse(JSON.stringify(score));
    }
  }, [score]);

  const [tempoInputText, setTempoInputText] = useState(score.tempo.toString());

  // Keep local input text in sync when score tempo changes from WebView or props
  useEffect(() => {
    setTempoInputText(score.tempo.toString());
  }, [score.tempo]);

  const reconstructScore = useCallback((project: any) => {
    const newScore = reconstructScoreData(project);
    setScore(newScore);
  }, []);

  // Load existing project or build state on mount/props change
  useEffect(() => {
    if (initialProjectId) {
      const loadExistingProject = async () => {
        try {
          let projectData: any = null;
          if (Platform.OS === 'web') {
            const data = localStorage.getItem('melo_project_' + initialProjectId);
            if (data) {
              projectData = JSON.parse(data);
            }
          } else {
            const projectsDir = `${FileSystem.documentDirectory}projects/`;
            const fileUri = `${projectsDir}${initialProjectId}.json`;
            const info = await FileSystem.getInfoAsync(fileUri);
            if (info.exists) {
              const data = await FileSystem.readAsStringAsync(fileUri);
              projectData = JSON.parse(data);
            }
          }

          if (projectData) {
            console.log("[LOAD PROJECT] Loaded existing project:", projectData);
            if (projectData.manualScoreState) {
              setScore(projectData.manualScoreState);
            } else {
              reconstructScore(projectData);
            }
          } else {
            reconstructScore({
              name: initialTitle || 'Untitled Score',
              timeSignature: initialTimeSignature || '4/4',
              detectedTempo: initialTempo || 120,
              convertedNotes: initialNotes,
            });
          }
        } catch (e) {
          console.error("[LOAD PROJECT] Error loading project:", e);
        }
      };
      loadExistingProject();
    } else if (initialNotes) {
      reconstructScore({
        name: initialTitle || 'Untitled Score',
        timeSignature: initialTimeSignature || '4/4',
        detectedTempo: initialTempo || 120,
        convertedNotes: initialNotes,
      });
    }
  }, [initialProjectId, initialNotes, reconstructScore]);

  const titleStartOffset = useRef({ x: 0, y: 0 });
  const authorStartOffset = useRef({ x: 0, y: 0 });

  const titlePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2;
      },
      onPanResponderGrant: () => {
        titleStartOffset.current = {
          x: score.title.x || 0,
          y: score.title.y || 0
        };
      },
      onPanResponderMove: (evt, gestureState) => {
        const nextX = titleStartOffset.current.x + gestureState.dx;
        const nextY = titleStartOffset.current.y + gestureState.dy;
        setScore(prev => ({
          ...prev,
          title: { ...prev.title, x: nextX, y: nextY }
        }));
      },
      onPanResponderRelease: () => {
        setHasChanges(true);
      }
    })
  ).current;

  const authorPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2;
      },
      onPanResponderGrant: () => {
        authorStartOffset.current = {
          x: score.author.x || 0,
          y: score.author.y || 0
        };
      },
      onPanResponderMove: (evt, gestureState) => {
        const nextX = authorStartOffset.current.x + gestureState.dx;
        const nextY = authorStartOffset.current.y + gestureState.dy;
        setScore(prev => ({
          ...prev,
          author: { ...prev.author, x: nextX, y: nextY }
        }));
      },
      onPanResponderRelease: () => {
        setHasChanges(true);
      }
    })
  ).current;

  // Editor interaction states
  const [selectedStaffIndex, setSelectedStaffIndex] = useState<number | null>(null);
  const [selectedStaffIndices, setSelectedStaffIndices] = useState<number[]>([]);
  const [selectedMeasureIndex, setSelectedMeasureIndex] = useState<number | null>(null);
  const [selectedBarId, setSelectedBarId] = useState<string | null>(null);
  const [swapMode, setSwapMode] = useState(false);
  const [selectedTextElement, setSelectedTextElement] = useState<'title' | 'author' | null>(null);

  // New editor feature states
  const [hasChanges, setHasChanges] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [showMeasureEditorModal, setShowMeasureEditorModal] = useState(false);
  const [showNoteSelectionModal, setShowNoteSelectionModal] = useState(false);
  const [noteModalSubMode, setNoteModalSubMode] = useState<'duration' | 'rest'>('duration');
  const [editingStaffIndex, setEditingStaffIndex] = useState<number>(0);
  const [selectedNoteIndex, setSelectedNoteIndex] = useState<number | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [selectedEditItemId, setSelectedEditItemId] = useState<string | null>(null);
  const [selectedPitchIndex, setSelectedPitchIndex] = useState<number>(0);

  const selectedEditItem = useMemo(() => {
    if (!selectedEditItemId) return null;
    return findNoteInScore(score, selectedEditItemId);
  }, [score, selectedEditItemId]);

  const editItemPitchParts = useMemo(() => {
    if (selectedEditItem && !selectedEditItem.note.isRest && selectedEditItem.note.pitch) {
      return getPitchParts(selectedEditItem.note.pitch);
    }
    return { step: 'C', accidental: '', octave: '4' };
  }, [selectedEditItem]);

  const [scrollY, setScrollY] = useState(0);
  const [scrollViewHeight, setScrollViewHeight] = useState(600);
  const [isWebViewEditModeActive, setIsWebViewEditModeActive] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [modalPreviewSvg, setModalPreviewSvg] = useState<string | null>(null);

  // SELECTION CHANGED LOGS
  const prevSelectionRef = React.useRef({
    selectedStaffIndex: null as number | null,
    selectedMeasureIndex: null as number | null,
    selectedBarId: null as string | null
  });

  const selectedMeasureIndexRef = useRef(selectedMeasureIndex);
  const editingStaffIndexRef = useRef(editingStaffIndex);
  const selectedBarIdRef = useRef(selectedBarId);
  const selectedStaffIndexRef = useRef(selectedStaffIndex);

  useEffect(() => {
    selectedMeasureIndexRef.current = selectedMeasureIndex;
  }, [selectedMeasureIndex]);

  useEffect(() => {
    editingStaffIndexRef.current = editingStaffIndex;
  }, [editingStaffIndex]);

  useEffect(() => {
    selectedBarIdRef.current = selectedBarId;
  }, [selectedBarId]);

  useEffect(() => {
    selectedStaffIndexRef.current = selectedStaffIndex;
  }, [selectedStaffIndex]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeNoteSelectionModal();
        return;
      }
      if (!showNoteSelectionModal || !selectedEditItemId || !selectedEditItem || selectedEditItem.note.isRest) {
        return;
      }
      
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleShiftDiatonically('up');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleShiftDiatonically('down');
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showNoteSelectionModal, selectedEditItemId, selectedEditItem, selectedPitchIndex]);

  useEffect(() => {
    const oldSelection = prevSelectionRef.current;
    const newSelection = { selectedStaffIndex, selectedMeasureIndex, selectedBarId };
    if (
      oldSelection.selectedStaffIndex !== newSelection.selectedStaffIndex ||
      oldSelection.selectedMeasureIndex !== newSelection.selectedMeasureIndex ||
      oldSelection.selectedBarId !== newSelection.selectedBarId
    ) {
      console.log("SELECTION CHANGED", {
        oldSelection,
        newSelection,
        source: "React Native State Hook"
      });
      prevSelectionRef.current = newSelection;
    }
  }, [selectedStaffIndex, selectedMeasureIndex, selectedBarId]);

  const numMeasures = score.staves.length > 0 ? score.staves[0].measures.length : 1;
  const currentMeasure = selectedMeasureIndex !== null && selectedMeasureIndex >= 0 && score.staves[editingStaffIndex] && numMeasures > 0
    ? score.staves[editingStaffIndex].measures[selectedMeasureIndex % numMeasures]
    : null;
  const currentNotes = currentMeasure?.notes || [];
  const userNotes = currentNotes.filter((n: any) => !n.isAutoGenerated);
  const selectedNote = selectedNoteIndex !== null && selectedNoteIndex >= 0 && selectedNoteIndex < userNotes.length
    ? userNotes[selectedNoteIndex]
    : null;
  const pitchParts = useMemo(() => {
    if (selectedNote && !selectedNote.isRest) {
      return getPitchParts(selectedNote.pitch);
    }
    return { step: 'C', accidental: '', octave: '4' };
  }, [selectedNote]);

  const updateSelectedNotePitch = (parts: { step?: string; accidental?: string; octave?: string }) => {
    if (selectedNoteIndex === null || !selectedNote) return;
    const newParts = { ...pitchParts, ...parts };
    const newPitch = `${newParts.step}${newParts.accidental}${newParts.octave}`;
    handleModifyNote(selectedNoteIndex, { pitch: newPitch });
  };


  // Playback states
  const [playbackMode, setPlaybackMode] = useState<'notation' | 'original'>('notation');
  const [recordingURI, setRecordingURI] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const pendingPlayAfterUnlockRef = React.useRef(false);
  const wasPlayingBeforeDragRef = React.useRef(false);
  const isModeSwitchingRef = useRef(false);
  const player = useAudioPlayer(recordingURI);

  const playbackModeRef = useRef(playbackMode);
  playbackModeRef.current = playbackMode;

  const playerCurrentTimeRef = useRef(0);
  const originalDurationRef = useRef(0);

  // Sync recording URI from loaded project
  useEffect(() => {
    if (initialProjectId) {
      const getProjUri = async () => {
        try {
          let projectData: any = null;
          if (Platform.OS === 'web') {
            const data = localStorage.getItem('melo_project_' + initialProjectId);
            if (data) projectData = JSON.parse(data);
          } else {
            const fileUri = `${FileSystem.documentDirectory}projects/${initialProjectId}.json`;
            const info = await FileSystem.getInfoAsync(fileUri);
            if (info.exists) {
              const data = await FileSystem.readAsStringAsync(fileUri);
              projectData = JSON.parse(data);
            }
          }
          if (projectData && projectData.recordingURI) {
            setRecordingURI(projectData.recordingURI);
          }
        } catch (e) {
          console.log('[AUDIO SYNC] failed to load project URI:', e);
        }
      };
      getProjUri();
    }
  }, [initialProjectId]);

  // Audio player duration setup for original audio mode
  useEffect(() => {
    if (!player) return;
    const interval = setInterval(() => {
      if (player.duration && player.duration > 0) {
        originalDurationRef.current = player.duration;
        const isOriginalMode = playbackMode === 'original';
        if (isOriginalMode) {
          setDuration(player.duration);
        }
        clearInterval(interval);
      }
    }, 300);
    return () => clearInterval(interval);
  }, [player, playbackMode]);

  // Update duration state when mode switches
  useEffect(() => {
    const isOriginalMode = playbackMode === 'original';
    if (isOriginalMode && originalDurationRef.current > 0) {
      setDuration(originalDurationRef.current);
    }
  }, [playbackMode]);

  // Sync high-frequency ticker for original audio playback
  useEffect(() => {
    let interval: any;
    if (isPlaying && playbackMode === 'original' && player) {
      interval = setInterval(() => {
        if (player.currentTime !== undefined && player.duration) {
          originalDurationRef.current = player.duration;
          const cur = player.currentTime;
          playerCurrentTimeRef.current = cur;
          setCurrentTime(cur);
          if (cur >= player.duration - 0.05) {
            clearInterval(interval);
            setIsPlaying(false);
            player.pause();
            player.seekTo(0);
            playerCurrentTimeRef.current = 0;
            setCurrentTime(0);
          }
        }
      }, 50);
    }
    return () => clearInterval(interval);
  }, [isPlaying, playbackMode, player]);

  // WebView Ref
  const localWebViewRef = React.useRef<any>(null);
  const webViewRef = parentWebViewRef || localWebViewRef;
  const pendingModalTimer = React.useRef<any>(null);
  const modalScrollViewRef = useRef<any>(null);

  useEffect(() => {
    if (showNoteSelectionModal) {
      const selectedMeasure = currentMeasure;
      console.log("[POPUP PREVIEW]", selectedMeasure);
      console.log("[POPUP PREVIEW] Measure data exists:", !!selectedMeasure);
      if (selectedMeasure) {
        console.log("[POPUP PREVIEW] Notes exist:", !!selectedMeasure.notes && selectedMeasure.notes.length > 0);
        console.log("[POPUP PREVIEW] Rests exist:", !!selectedMeasure.notes && selectedMeasure.notes.some((n: any) => n.isRest));
      }
      setTimeout(() => {
        modalScrollViewRef.current?.scrollTo({ y: 0, animated: false });
      }, 50);
    }
  }, [showNoteSelectionModal, currentMeasure]);

  const closeNoteSelectionModal = () => {
    console.log("SELECTION CHANGED (Modal close - preserving selection)", {
      currentSelection: { selectedStaffIndex, selectedMeasureIndex, selectedBarId },
      source: "closeNoteSelectionModal()"
    });
    setShowNoteSelectionModal(false);
    setIsWebViewEditModeActive(false);
    setModalPreviewSvg(null);
    setSelectedEditItemId(null);
    setSelectedPitchIndex(0);

    // Send EXIT_EDIT_MODE to WebView to clear edit mode state and selection block
    if (webViewRef.current) {
      const clearMsg = JSON.stringify({ type: 'EXIT_EDIT_MODE' });
      if (typeof webViewRef.current.postMessage === 'function') {
        webViewRef.current.postMessage(clearMsg);
      } else if ((webViewRef.current as any).contentWindow) {
        (webViewRef.current as any).contentWindow.postMessage(clearMsg, '*');
      }
    }

    if (pendingModalTimer.current) {
      clearTimeout(pendingModalTimer.current);
      pendingModalTimer.current = null;
    }
  };

  // Modal triggers for pickers
  const [showKeyPicker, setShowKeyPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showClefPicker, setShowClefPicker] = useState(false);
  const [showStaffClefModal, setShowStaffClefModal] = useState(false);

  // Generate MusicXML
  const scoreMusicXML = useMemo(() => {
    console.log("[INSERT STAFF] MusicXML regenerated");
    console.log("SELECTION CHANGED (MusicXML regeneration)", {
      currentSelection: { selectedStaffIndex, selectedMeasureIndex, selectedBarId },
      source: "scoreMusicXML useMemo"
    });
    console.log("[SCORE DATA]", score);
    const musicXML = generateMusicXML(score);
    console.log("[MUSICXML EXISTS]", !!musicXML);
    console.log("[MUSICXML LENGTH]", musicXML?.length);
    console.log('[DEBUG] MusicXML generated');
    console.log('[DEBUG] MusicXML length:', musicXML?.length);
    // console.log('[DEBUG] MusicXML preview:', musicXML?.substring(0,500));
    return musicXML;
  }, [score]);

  // Floating Text Toolbar for Title/Composer editing
  const FloatingTextToolbar = ({ element }: { element: 'title' | 'author' }) => {
    const item = element === 'title' ? score.title : score.author;

    const setItemStyle = (update: Partial<FormattedText>) => {
      setScore(prev => {
        const target = element === 'title' ? 'title' : 'author';
        return {
          ...prev,
          [target]: { ...prev[target], ...update }
        };
      });
      setHasChanges(true);
      
      // Refocus input to allow continued typing and formatting on all platforms
      const inputRef = element === 'title' ? titleInputRef : authorInputRef;
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    };

    const cycleFont = () => {
      const fonts = ['Default', 'Serif', 'Sans-Serif', 'Monospace'];
      const nextIdx = (fonts.indexOf(item.fontFamily) + 1) % fonts.length;
      setItemStyle({ fontFamily: fonts[nextIdx] });
    };
    

    return (
      <Pressable
        onPressIn={() => { isInteractingWithToolbar.current = true; }}
        style={styles.floatingToolbar}
      >
        {/* Font Cycle Button */}
        <Pressable
          onPressIn={() => { isInteractingWithToolbar.current = true; }}
          onPress={cycleFont}
          style={styles.toolbarBtn}
        >
          <Ionicons name="text-outline" size={14} color="white" />
          <Text style={styles.toolbarBtnText}>{item.fontFamily}</Text>
        </Pressable>

        {/* Font Size decrease */}
        <Pressable
          onPressIn={() => { isInteractingWithToolbar.current = true; }}
          onPress={() => setItemStyle({ fontSize: Math.max(8, item.fontSize - 2) })}
          style={styles.toolbarSizeBtn}
        >
          <Ionicons name="remove" size={14} color="white" />
        </Pressable>

        {/* Font Size display */}
        <Text style={styles.toolbarSizeText}>{item.fontSize}</Text>

        {/* Font Size increase */}
        <Pressable
          onPressIn={() => { isInteractingWithToolbar.current = true; }}
          onPress={() => setItemStyle({ fontSize: Math.min(72, item.fontSize + 2) })}
          style={styles.toolbarSizeBtn}
        >
          <Ionicons name="add" size={14} color="white" />
        </Pressable>

        {/* Bold Toggle */}
        <Pressable
          onPressIn={() => { isInteractingWithToolbar.current = true; }}
          onPress={() => setItemStyle({ bold: !item.bold })}
          style={[styles.toolbarBtn, item.bold && styles.toolbarBtnActive]}
        >
          <Text style={[styles.toolbarBtnText, { fontWeight: 'bold', color: item.bold ? 'black' : 'white' }]}>B</Text>
        </Pressable>

        {/* Italic Toggle */}
        <Pressable
          onPressIn={() => { isInteractingWithToolbar.current = true; }}
          onPress={() => setItemStyle({ italic: !item.italic })}
          style={[styles.toolbarBtn, item.italic && styles.toolbarBtnActive]}
        >
          <Text style={[styles.toolbarBtnText, { fontStyle: 'italic', color: item.italic ? 'black' : 'white' }]}>I</Text>
        </Pressable>
      </Pressable>
    );
  };

  // Dummy notes object to force SheetMusic WebView activation
  const dummyNotes = useMemo(() => {
    return {
      treble: [{ pitch: 'rest', duration: 'w', beats: 4, absoluteIndex: 0 }],
      bass: [],
    };
  }, []);

  // Post messages to WebView/iframe (web safe)
  const postMessageToSheet = (payload: any) => {
    const jsonStr = JSON.stringify(payload);
    if (Platform.OS === 'web') {
      const activeId = sheetMusicId || "scratch-editor-music-sheet";
      const iframe = document.getElementById(activeId) as HTMLIFrameElement;
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(jsonStr, '*');
      } else if (webViewRef.current) {
        const target = webViewRef.current.contentWindow || webViewRef.current;
        if (target && typeof target.postMessage === 'function') {
          target.postMessage(jsonStr, '*');
        }
      }
    } else {
      if (webViewRef.current) {
        webViewRef.current.postMessage(jsonStr);
      }
    }
  };

  const handleZoomIn = () => postMessageToSheet({ type: 'ZOOM_IN' });
  const handleZoomOut = () => postMessageToSheet({ type: 'ZOOM_OUT' });
  const handleResetZoom = () => postMessageToSheet({ type: 'RESET_ZOOM' });

  // Playback functions
  const playRecording = () => {
    if (playbackMode === 'original') {
      if (isPlaying) {
        setIsPlaying(false);
        player.pause();
      } else {
        if (currentTime >= duration) {
          setCurrentTime(0);
          playerCurrentTimeRef.current = 0;
          player.seekTo(0);
        } else {
          player.seekTo(currentTime);
        }
        player.play();
        setIsPlaying(true);
      }
    } else {
      if (isPlaying) {
        postMessageToSheet({ type: 'PAUSE' });
        setIsPlaying(false);
      } else {
        pendingPlayAfterUnlockRef.current = true;
        postMessageToSheet({ type: 'UNLOCK_AUDIO' });
      }
    }
  };

  const restartPlayback = () => {
    if (playbackMode === 'original') {
      setCurrentTime(0);
      playerCurrentTimeRef.current = 0;
      player.seekTo(0);
      player.play();
      setIsPlaying(true);
    } else {
      postMessageToSheet({ type: 'RESTART' });
    }
  };

  const handleDragStart = () => {
    wasPlayingBeforeDragRef.current = isPlaying;
    if (isPlaying) {
      if (playbackMode === 'original') {
        player.pause();
      } else {
        postMessageToSheet({ type: 'PAUSE' });
      }
      setIsPlaying(false);
    }
  };

  const handleSeek = (time: number) => {
    if (playbackMode === 'original') {
      player.seekTo(time);
      playerCurrentTimeRef.current = time;
    } else {
      postMessageToSheet({ type: 'SEEK', time });
    }
    setCurrentTime(time);
    if (wasPlayingBeforeDragRef.current) {
      if (playbackMode === 'original') {
        player.play();
      } else {
        postMessageToSheet({ type: 'PLAY' });
      }
      setIsPlaying(true);
    }
  };

  const exitEditorDirectly = () => {
    console.log('[EXIT] Leaving editor');
    if (pendingModalTimer.current) {
      clearTimeout(pendingModalTimer.current);
      pendingModalTimer.current = null;
    }

    if (onExit) {
      onExit();
      return;
    }

    // Clear/reset editor states
    setSelectedStaffIndex(null);
    setSelectedStaffIndices([]);
    setSelectedMeasureIndex(null);
    setSelectedBarId(null);
    setSelectedTextElement(null);
    setSwapMode(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setHasChanges(false);
    setEditorMode('choice');

    try {
      if (Platform.OS === 'web') {
        router.replace('/projects');
      } else if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/projects');
      }
    } catch (e) {
      console.error('[EXIT] Error navigating back, falling back to projects:', e);
      router.replace('/projects');
    }
  };

  const handleExitEditMode = () => {
    console.log('[EXIT EDIT MODE] Clicked');
    console.log('[EXIT EDIT MODE] Unsaved changes:', hasChanges);
    if (hasChanges) {
      setShowUnsavedModal(true);
    } else {
      setIsEditMode(false);
      
      // Clear local React state selections
      setSelectedStaffIndex(null);
      setSelectedStaffIndices([]);
      setSelectedMeasureIndex(null);
      setSelectedBarId(null);
      setSelectedTextElement(null);
      setSwapMode(false);

      // Notify WebView of edit mode change
      postMessageToSheet({ type: 'SET_EDIT_MODE', editable: false });
      
      // Send EXIT_EDIT_MODE to WebView to clear highlights
      postMessageToSheet({ type: 'EXIT_EDIT_MODE' });
    }
  };

  const handleSaveEditMode = async () => {
    await handleSaveProject();
    setShowUnsavedModal(false);
    setIsEditMode(false);
    
    // Clear React selection states
    setSelectedStaffIndex(null);
    setSelectedStaffIndices([]);
    setSelectedMeasureIndex(null);
    setSelectedBarId(null);
    setSelectedTextElement(null);
    setSwapMode(false);

    // Notify WebView
    postMessageToSheet({ type: 'SET_EDIT_MODE', editable: false });
    postMessageToSheet({ type: 'EXIT_EDIT_MODE' });
  };

  const handleDiscardEditMode = () => {
    if (initialScoreRef.current) {
      setScore(JSON.parse(JSON.stringify(initialScoreRef.current)));
    }
    setHasChanges(false);
    setShowUnsavedModal(false);
    setIsEditMode(false);
    
    // Clear React selection states
    setSelectedStaffIndex(null);
    setSelectedStaffIndices([]);
    setSelectedMeasureIndex(null);
    setSelectedBarId(null);
    setSelectedTextElement(null);
    setSwapMode(false);

    // Notify WebView
    postMessageToSheet({ type: 'SET_EDIT_MODE', editable: false });
    postMessageToSheet({ type: 'EXIT_EDIT_MODE' });
  };

  const handleExit = () => {
    console.log('[EXIT] Clicked');
    console.log('[EXIT] Unsaved changes:', hasChanges);
    if (hasChanges) {
      setShowUnsavedModal(true);
    } else {
      exitEditorDirectly();
    }
  };

  const handleSaveProject = async () => {
    console.log('[SAVE] Clicked');
    console.log('[SAVE] Saving project');
    try {
      const activeId = initialProjectId || 'local_manual_' + Date.now();
      
      let existingProject: any = {};
      try {
        if (Platform.OS === 'web') {
          const data = localStorage.getItem('melo_project_' + activeId);
          if (data) existingProject = JSON.parse(data);
        } else {
          const fileUri = `${FileSystem.documentDirectory}projects/${activeId}.json`;
          const info = await FileSystem.getInfoAsync(fileUri);
          if (info.exists) {
            const data = await FileSystem.readAsStringAsync(fileUri);
            existingProject = JSON.parse(data);
          }
        }
      } catch (err) {
        console.log('[SAVE] No existing project found to merge, using defaults');
      }

      const projectData = {
        ...existingProject,
        id: activeId,
        name: score.title.text || 'Untitled Score',
        date: new Date().toISOString(),
        recordingURI: existingProject.recordingURI || '',
        convertedNotes: existingProject.convertedNotes || 
                        existingProject.notes || 
                        ((existingProject.treble_notes || existingProject.bass_notes) ? { 
                          treble: existingProject.treble_notes || [], 
                          bass: existingProject.bass_notes || [], 
                          playback: existingProject.notes || [] 
                        } : undefined) || 
                        dummyNotes,
        musicXML: scoreMusicXML,
        timeSignature: score.timeSignature,
        detectedTempo: score.tempo,
        qualityScores: existingProject.qualityScores,
        duration: existingProject.duration || 0,
        audioSize: existingProject.audioSize || 0,
        sourceType: existingProject.sourceType || 'manual',
        manualScoreState: score,
      };

      console.log('[SAVE] Project data:', projectData);

      if (Platform.OS === 'web') {
        localStorage.setItem('melo_project_' + activeId, JSON.stringify(projectData));
        console.log('[SAVE] Saved manual project to local storage:', activeId);
      } else {
        const projectsDir = `${FileSystem.documentDirectory}projects/`;
        const dirInfo = await FileSystem.getInfoAsync(projectsDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(projectsDir, { intermediates: true });
        }
        const projectFileUri = `${projectsDir}${activeId}.json`;
        await FileSystem.writeAsStringAsync(projectFileUri, JSON.stringify(projectData));
        console.log('[SAVE] Saved manual project locally:', projectFileUri);
      }
      
      setHasChanges(false);
      initialScoreRef.current = JSON.parse(JSON.stringify(score)); // Update saved snapshot
      console.log('[SAVE] Success');
      Alert.alert('Success', 'Project saved successfully.');
    } catch (err) {
      console.error('[SAVE] Failed to save project:', err);
      Alert.alert('Error', 'Failed to save project.');
    }
  };

  const handleSaveAndExit = async () => {
    console.log('[EXIT] Clicked');
    console.log('[EXIT] Unsaved changes:', hasChanges);
    await handleSaveProject();
    setShowUnsavedModal(false);
    exitEditorDirectly();
  };

  const handleDiscardAndExit = () => {
    console.log('[EXIT] Clicked');
    console.log('[EXIT] Unsaved changes:', hasChanges);
    setShowUnsavedModal(false);
    exitEditorDirectly();
  };

  // Android Back Handler
  useEffect(() => {
    const backAction = () => {
      if (editorMode === 'scratch') {
        if (isEditMode) {
          handleExitEditMode();
        } else {
          handleExit();
        }
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, [editorMode, isEditMode]);

  // Webview communication handler
  const handleMessage = (event: any) => {
    if (onWebViewMessage) {
      onWebViewMessage(event);
    }
    let data = null;
    try {
      data = typeof event.nativeEvent.data === 'string'
        ? JSON.parse(event.nativeEvent.data)
        : event.nativeEvent.data;
    } catch (e) {
      // Ignore parse errors from unrelated messages (e.g. React DevTools / Expo internal messages)
      return;
    }

    const EXPECTED_TYPES = [
      'STAFF_SELECTED',
      'MEASURE_SELECTED',
      'BAR_SELECTED',
      'NOTE_SELECTED',
      'NOTES_SELECTED',
      'NOTE_DESELECTED',
      'MOVE_NOTE',
      'STAFF_REORDER',
      'MEASURE_REORDER',
      'TEMPO_CHANGE',
      'PLAYBACK_PROGRESS',
      'PLAYBACK_STATE',
      'UNLOCK_AUDIO_SUCCESS',
      'RENDER_SUCCESS',
      'INSERT_NOTE',
      'INSERT_STAFF_BELOW',
      'EDIT_MODE_CHANGED',
      'UPDATE_MODAL_PREVIEW',
      'PREVIEW_ITEM_CLICKED',
      'PREVIEW_DESELECT'
    ];

    if (!data || typeof data !== 'object' || !data.type || !EXPECTED_TYPES.includes(data.type)) {
      return;
    }

    // Cancel any pending modal timer on any interaction/message
    if (pendingModalTimer.current) {
      clearTimeout(pendingModalTimer.current);
      pendingModalTimer.current = null;
    }

    try {
      switch (data.type) {
        case 'RENDER_SUCCESS':
          console.log("SELECTION CHANGED (RENDER_SUCCESS message)", {
            currentSelection: { selectedStaffIndex, selectedMeasureIndex, selectedBarId },
            source: 'handleMessage:RENDER_SUCCESS'
          });
          if (selectedBarId) {
            const parts = selectedBarId.split('_');
            const staffPart = parts[0];
            const measurePart = parts[1];
            let staffNumber = 1;
            if (staffPart === 'treble') {
              staffNumber = 1;
            } else if (staffPart === 'bass') {
              staffNumber = 2;
            } else {
              staffNumber = parseInt(staffPart.replace('staff', '')) || 1;
            }
            const measureNumber = parseInt(measurePart.replace('m', '')) || 1;
            postMessageToSheet({
              type: 'SELECT_BAR',
              selectionId: selectedBarId,
              staffNumber: staffNumber,
              measureNumber: measureNumber
            });
          } else if (selectedNoteId) {
            postMessageToSheet({
              type: 'SELECT_NOTE',
              noteId: selectedNoteId
            });
          }
          break;
        case 'STAFF_SELECTED':
          const indices = data.staffIndices || (data.staffIndex !== undefined ? [data.staffIndex] : []);
          console.log("SELECTION CHANGED (STAFF_SELECTED message)", {
            oldSelection: { selectedStaffIndex, selectedMeasureIndex, selectedBarId },
            newSelection: { selectedStaffIndices: indices, selectedMeasureIndex: null, selectedBarId: null },
            source: 'handleMessage:STAFF_SELECTED'
          });
          const isSameIndices = selectedStaffIndices.length === indices.length && selectedStaffIndices.every((val, idx) => val === indices[idx]);
          if (!isSameIndices) setSelectedStaffIndices(indices);
          
          const firstIndex = indices.length > 0 ? indices[0] : null;
          if (selectedStaffIndex !== firstIndex) setSelectedStaffIndex(firstIndex);
          if (selectedMeasureIndex !== null) setSelectedMeasureIndex(null);
          if (selectedBarId !== null) setSelectedBarId(null);
          if (selectedTextElement !== null) setSelectedTextElement(null);
          if (selectedNoteId !== null) setSelectedNoteId(null);
          if (selectedNoteIds.length > 0) setSelectedNoteIds([]);
          break;
        case 'BAR_SELECTED':
          const staffNum = typeof data.staffNumber === 'number' && !isNaN(data.staffNumber) ? data.staffNumber : 1;
          const measureNum = typeof data.measureNumber === 'number' && !isNaN(data.measureNumber) ? data.measureNumber : 1;

          // Coordinate mapping to resolve database indices
          const partsPartition: Staff[][] = [];
          for (let i = 0; i < score.staves.length; i++) {
            if (i < score.staves.length - 1 && score.staves[i].clef === 'treble' && score.staves[i+1].clef === 'bass') {
              partsPartition.push([score.staves[i], score.staves[i+1]]);
              i++;
            } else {
              partsPartition.push([score.staves[i]]);
            }
          }
          const numMeasures = score.staves.length > 0 ? score.staves[0].measures.length : 4;
          const partIdx = Math.floor((measureNum - 1) / numMeasures);
          const measureIdx = (measureNum - 1) % numMeasures;
          
          let resolvedStaffIndex = 0;
          for (let p = 0; p < partIdx; p++) {
            resolvedStaffIndex += partsPartition[p] ? partsPartition[p].length : 1;
          }
          const priorStavesCount = resolvedStaffIndex;
          const currentPartStaves = partsPartition[partIdx] || [];
          const localStaffIdx = Math.max(0, Math.min(staffNum - 1 - priorStavesCount, Math.max(currentPartStaves.length - 1, 0)));
          resolvedStaffIndex += localStaffIdx;

          console.log("SELECTION CHANGED (BAR_SELECTED message)", {
            oldSelection: { selectedStaffIndex, selectedMeasureIndex, selectedBarId },
            newSelection: { selectedStaffIndex: resolvedStaffIndex, selectedMeasureIndex: measureIdx, selectedBarId: data.selectionId },
            source: 'handleMessage:BAR_SELECTED'
          });
          console.log(
            "BAR_SELECTED RECEIVED",
            {
              selectionId: data.selectionId,
              measureNum,
              staffNum,
              resolvedStaffIndex,
              measureIdx
            }
          );
          if (selectedNoteId !== null) setSelectedNoteId(null);
          if (selectedNoteIds.length > 0) setSelectedNoteIds([]);
          if (selectedBarId !== data.selectionId) setSelectedBarId(data.selectionId);
          if (selectedMeasureIndex !== measureIdx) setSelectedMeasureIndex(measureIdx);
          if (selectedStaffIndex !== resolvedStaffIndex) setSelectedStaffIndex(resolvedStaffIndex);
          if (selectedStaffIndices.length > 0) setSelectedStaffIndices([]);
          if (selectedTextElement !== null) setSelectedTextElement(null);
          if (editingStaffIndex !== resolvedStaffIndex) setEditingStaffIndex(resolvedStaffIndex);
          if (selectedNoteIndex !== null) setSelectedNoteIndex(null);
          if (noteModalSubMode !== 'duration') setNoteModalSubMode('duration');
          break;
        case 'INSERT_NOTE':
          console.log("WEBVIEW REQUESTED NOTE INSERTION:", data.noteType, "isRest:", data.isRest);
          handleInsertNote(data.noteType, !!data.isRest);
          break;
        case 'MEASURE_SELECTED':
          console.log("SELECTION CHANGED (MEASURE_SELECTED message)", {
            oldSelection: { selectedStaffIndex, selectedMeasureIndex, selectedBarId },
            newSelection: { selectedStaffIndex: null, selectedMeasureIndex: data.measureIndex, selectedBarId: null },
            source: 'handleMessage:MEASURE_SELECTED'
          });
          if (selectedNoteId !== null) setSelectedNoteId(null);
          if (selectedNoteIds.length > 0) setSelectedNoteIds([]);
          if (selectedBarId !== null) setSelectedBarId(null);
          if (swapMode && selectedMeasureIndex !== null) {
            handleSwapMeasures(selectedMeasureIndex, data.measureIndex);
            setSwapMode(false);
          } else {
            if (selectedMeasureIndex !== data.measureIndex) setSelectedMeasureIndex(data.measureIndex);
            if (selectedStaffIndex !== null) setSelectedStaffIndex(null);
            if (selectedStaffIndices.length > 0) setSelectedStaffIndices([]);
            if (selectedTextElement !== null) setSelectedTextElement(null);
            if (editingStaffIndex !== 0) setEditingStaffIndex(0);
            if (selectedNoteIndex !== null) setSelectedNoteIndex(null);
            if (noteModalSubMode !== 'duration') setNoteModalSubMode('duration');
          }
          break;
        case 'NOTE_SELECTED':
          console.log("SELECTION CHANGED (NOTE_SELECTED message)", {
            oldSelection: { selectedStaffIndex, selectedMeasureIndex, selectedBarId },
            newSelection: { selectedStaffIndex: null, selectedMeasureIndex: null, selectedBarId: null },
            source: 'handleMessage:NOTE_SELECTED'
          });
          if (selectedNoteIds.length > 0) setSelectedNoteIds([]);
          if (showMeasureEditorModal && selectedMeasureIndex !== null) {
            const found = findNoteInScore(score, data.noteId);
            const numMeas = score.staves.length > 0 ? score.staves[0].measures.length : 1;
            const localMIdx = selectedMeasureIndex % numMeas;
            if (found && found.measureIndex === localMIdx && found.staffIndex === editingStaffIndex) {
              const currentNotes = score.staves[editingStaffIndex].measures[localMIdx].notes || [];
              const userNotes = currentNotes.filter((n: any) => !n.isAutoGenerated);
              const targetNoteIdx = userNotes.findIndex((n: any) => n.id === found.note.id || n.id === data.noteId);
              if (targetNoteIdx !== -1) {
                if (selectedNoteIndex !== targetNoteIdx) setSelectedNoteIndex(targetNoteIdx);
              }
            }
          } else {
            if (selectedNoteId !== data.noteId) setSelectedNoteId(data.noteId);
            if (selectedMeasureIndex !== null) setSelectedMeasureIndex(null);
            if (selectedBarId !== null) setSelectedBarId(null);
            if (selectedStaffIndex !== null) setSelectedStaffIndex(null);
            if (selectedStaffIndices.length > 0) setSelectedStaffIndices([]);
          }
          break;
        case 'NOTES_SELECTED':
          console.log("SELECTION CHANGED (NOTES_SELECTED message)", {
            noteIds: data.noteIds
          });
          const nextNoteIds = data.noteIds || [];
          const isSameNoteIds = selectedNoteIds.length === nextNoteIds.length && selectedNoteIds.every((id, idx) => id === nextNoteIds[idx]);
          if (!isSameNoteIds) setSelectedNoteIds(nextNoteIds);
          
          const lastNoteId = nextNoteIds.length > 0 ? nextNoteIds[nextNoteIds.length - 1] : null;
          if (selectedNoteId !== lastNoteId) setSelectedNoteId(lastNoteId);
          if (selectedMeasureIndex !== null) setSelectedMeasureIndex(null);
          if (selectedBarId !== null) setSelectedBarId(null);
          if (selectedStaffIndex !== null) setSelectedStaffIndex(null);
          if (selectedStaffIndices.length > 0) setSelectedStaffIndices([]);
          break;
        case 'NOTE_DESELECTED':
          console.log("SELECTION CHANGED (NOTE_DESELECTED message)", {
            oldSelection: { selectedStaffIndex, selectedMeasureIndex, selectedBarId },
            newSelection: { selectedStaffIndex: null, selectedMeasureIndex: null, selectedBarId: null },
            source: 'handleMessage:NOTE_DESELECTED'
          });
          if (selectedNoteId !== null) setSelectedNoteId(null);
          if (selectedNoteIds.length > 0) setSelectedNoteIds([]);
          if (selectedBarId !== null) setSelectedBarId(null);
          if (selectedMeasureIndex !== null) setSelectedMeasureIndex(null);
          if (selectedStaffIndex !== null) setSelectedStaffIndex(null);
          if (selectedStaffIndices.length > 0) setSelectedStaffIndices([]);
          break;
        case 'MOVE_NOTE':
          if (data.noteId) {
            handleMoveNoteDirectly(data.noteId, data.direction);
          }
          break;
        case 'INSERT_STAFF_BELOW':
          console.log("[INSERT STAFF] RECEIVED");
          if (data.staffIndex !== undefined) {
            handleInsertStaffBelow(data.staffIndex);
          }
          break;
        case 'CLEAR_SELECTION':
          setSelectedStaffIndices([]);
          setSelectedStaffIndex(null);
          setSelectedMeasureIndex(null);
          setSelectedBarId(null);
          setSelectedNoteId(null);
          setSelectedNoteIds([]);
          setSelectedTextElement(null);
          break;
        case 'STAFF_REORDER':
          handleReorderStaves(data.fromIndex, data.toIndex);
          setHasChanges(true);
          break;
        case 'MEASURE_REORDER':
          handleReorderMeasures(data.fromIndex, data.toIndex);
          setHasChanges(true);
          break;
        case 'TEMPO_CHANGE':
          if (data.tempo !== undefined) {
            console.log('[CREATE] Received TEMPO_CHANGE, but ignoring setScore to preserve original detected tempo:', data.tempo);
            // Intentionally removed tempo update to keep detectedTempo constant
            // setScore(prev => {
            //   if (prev.tempo === data.tempo) return prev;
            //   return { ...prev, tempo: Math.round(data.tempo) };
            // });
            // setHasChanges(true);
          }
          break;
        case 'PLAYBACK_PROGRESS':
        case 'PLAYBACK_STATE':
          if (data.currentTime !== undefined) {
            setCurrentTime(data.currentTime);
          }
          if (data.duration !== undefined) {
            setDuration(data.duration);
          }
          if (data.isPlaying !== undefined) {
            setIsPlaying(data.isPlaying);
          }
          break;
        case 'UNLOCK_AUDIO_SUCCESS':
          console.log('[AUDIT] RN (create.tsx) received UNLOCK_AUDIO_SUCCESS');
          if (pendingPlayAfterUnlockRef.current) {
            pendingPlayAfterUnlockRef.current = false;
            postMessageToSheet({ type: 'PLAY' });
          }
          break;
        case 'EDIT_MODE_CHANGED':
          setIsWebViewEditModeActive(data.active);
          setSelectedEditItemId(null);
          setSelectedPitchIndex(0);
          if (data.active) {
            setModalPreviewSvg(data.svgHtml || null);
            setShowNoteSelectionModal(true);
          } else {
            setShowNoteSelectionModal(false);
            setModalPreviewSvg(null);
          }
          break;
        case 'UPDATE_MODAL_PREVIEW':
          if (data.svgHtml) {
            setModalPreviewSvg(data.svgHtml);
          }
          break;
        case 'PREVIEW_ITEM_CLICKED':
          if (data.itemId) {
            const found = findNoteInScore(score, data.itemId);
            if (found) {
              setSelectedEditItemId(found.note.id || data.itemId);
              setSelectedPitchIndex(found.pitchIndex);
            } else {
              setSelectedEditItemId(data.itemId);
              setSelectedPitchIndex(0);
            }
          }
          break;
        case 'PREVIEW_DESELECT':
          setSelectedEditItemId(null);
          setSelectedPitchIndex(0);
          break;
        default:
          break;
      }
    } catch (e) {
      console.warn('Error parsing message from webview:', e);
    }
  };

  // Staff Controls
  const handleAddStaff = (clef: 'treble' | 'bass' | 'alto' | 'tenor') => {
    const numMeasures = score.staves.length > 0 ? score.staves[0].measures.length : 4;
    const newMeasures = getInitialMeasures(numMeasures, score.timeSignature);
    const newStaff: Staff = {
      id: 'staff_' + Math.random().toString(36).substr(2, 9),
      clef: clef,
      measures: newMeasures,
    };
    setScore(prev => ({
      ...prev,
      staves: [...prev.staves, newStaff],
    }));
    setShowClefPicker(false);
    setHasChanges(true);
  };

  const handleAddStaffDirectly = () => {
    const isGrand = hasGrandStaffPair(score.staves);
    const numMeasures = score.staves.length > 0 ? score.staves[0].measures.length : 4;

    if (isGrand) {
      const newMeasures1 = getInitialMeasures(numMeasures, score.timeSignature);
      const newMeasures2 = getInitialMeasures(numMeasures, score.timeSignature);
      const newTrebleStaff: Staff = {
        id: 'staff_' + Math.random().toString(36).substr(2, 9),
        clef: 'treble',
        measures: newMeasures1,
      };
      const newBassStaff: Staff = {
        id: 'staff_' + Math.random().toString(36).substr(2, 9),
        clef: 'bass',
        measures: newMeasures2,
      };
      setScore(prev => ({
        ...prev,
        staves: [...prev.staves, newTrebleStaff, newBassStaff],
      }));
    } else {
      const newMeasures = getInitialMeasures(numMeasures, score.timeSignature);
      const newStaff: Staff = {
        id: 'staff_' + Math.random().toString(36).substr(2, 9),
        clef: 'treble',
        measures: newMeasures,
      };
      setScore(prev => ({
        ...prev,
        staves: [...prev.staves, newStaff],
      }));
    }
    setHasChanges(true);
  };

  const handleChangeStaffClef = (clef: 'treble' | 'bass' | 'alto' | 'tenor') => {
    if (selectedStaffIndex === null) return;
    setScore(prev => {
      const updatedStaves = [...prev.staves];
      updatedStaves[selectedStaffIndex] = {
        ...updatedStaves[selectedStaffIndex],
        clef: clef
      };
      return {
        ...prev,
        staves: updatedStaves
      };
    });
    setShowStaffClefModal(false);
    setHasChanges(true);
  };

  const validateStaffDeletion = (
    scoreStaves: Staff[],
    stavesToRemove: Staff[]
  ): string | null => {
    // Find the first treble staff in the score
    const firstTreble = scoreStaves.find(s => s.clef === 'treble');
    // Find the first bass staff in the score
    const firstBass = scoreStaves.find(s => s.clef === 'bass');

    for (const staff of stavesToRemove) {
      // RULE 1 / 5: First Treble staff can never be deleted
      if (firstTreble && staff.id === firstTreble.id) {
        return "The first Treble staff cannot be deleted.";
      }

      if (staff.clef === 'bass') {
        if (firstBass && staff.id === firstBass.id) {
          // First bass staff can be deleted ONLY when there are no other bass clefs in the score
          const otherBassStaves = scoreStaves.filter(s => s.clef === 'bass' && s.id !== firstBass.id);
          if (otherBassStaves.length > 0) {
            return "The first Bass staff cannot be deleted while other Bass staves exist.";
          }
        }
      } else if (staff.clef === 'treble') {
        // RULE 3 / 4: Non-first Treble staffs are protected while their paired Bass staff still exists
        const k = scoreStaves.findIndex(orig => orig.id === staff.id);
        const hasCorrespondingBass = k !== -1 && k < scoreStaves.length - 1 && scoreStaves[k + 1].clef === 'bass';
        if (hasCorrespondingBass) {
          const bassStaff = scoreStaves[k + 1];
          const isBassBeingRemoved = stavesToRemove.some(rem => rem.id === bassStaff.id);
          if (!isBassBeingRemoved) {
            return "Delete the paired Bass staff first.";
          }
        }
      }
    }

    return null; // Valid
  };

  const handleRemoveStaff = () => {
    if (score.staves.length <= 1) {
      Alert.alert('Cannot Remove Staff', 'Scores must contain at least one staff.');
      return;
    }
    const newStaves = [...score.staves];
    const indexToRemove = newStaves.length - 1;
    
    // Check if the last staff is part of a grand staff pair
    let isPart2 = false;
    if (
      indexToRemove > 0 &&
      newStaves[indexToRemove].clef === 'bass' &&
      newStaves[indexToRemove - 1].clef === 'treble'
    ) {
      isPart2 = true;
    }
    
    let countToRemove = isPart2 ? 2 : 1;
    let startIndexToRemove = isPart2 ? indexToRemove - 1 : indexToRemove;

    if (newStaves.length - countToRemove < 1) {
      Alert.alert('Cannot Remove Staff', 'Scores must contain at least one staff.');
      return;
    }

    const stavesToRemove = newStaves.slice(startIndexToRemove, startIndexToRemove + countToRemove);
    const validationError = validateStaffDeletion(score.staves, stavesToRemove);
    if (validationError) {
      Alert.alert('Cannot Remove Staff', validationError);
      return;
    }

    setScore(prev => {
      const updatedStaves = [...prev.staves];
      updatedStaves.splice(startIndexToRemove, countToRemove);
      return { ...prev, staves: updatedStaves };
    });
    
    setSelectedStaffIndex(null);
    setHasChanges(true);
  };

  const handleDeleteSelectedStaves = () => {
    if (selectedStaffIndices.length === 0) return;

    if (selectedStaffIndices.length >= score.staves.length) {
      Alert.alert('Cannot Remove Staff', 'At least one staff must remain in the score.');
      return;
    }

    const selectedStaves = score.staves.filter((_, idx) => selectedStaffIndices.includes(idx));
    const validationError = validateStaffDeletion(score.staves, selectedStaves);
    if (validationError) {
      Alert.alert('Cannot Remove Staff', validationError);
      return;
    }

    setScore(prev => {
      const updatedStaves = prev.staves.filter((_, idx) => !selectedStaffIndices.includes(idx));
      return { ...prev, staves: updatedStaves };
    });

    setSelectedStaffIndices([]);
    setSelectedStaffIndex(null);
    postMessageToSheet({ type: 'CLEAR_SELECTION' });
    setHasChanges(true);
  };

  const handleClearSelectedStaves = () => {
    if (selectedStaffIndices.length === 0) return;

    setScore(prev => {
      const updatedStaves = prev.staves.map((staff, idx) => {
        if (selectedStaffIndices.includes(idx)) {
          const maxDur = getMeasureMaxDuration(prev.timeSignature);
          const updatedMeasures = staff.measures.map(measure => ({
            ...measure,
            notes: getFillerRests(maxDur),
          }));
          return { ...staff, measures: updatedMeasures };
        }
        return staff;
      });
      return { ...prev, staves: updatedStaves };
    });

    setSelectedStaffIndices([]);
    setSelectedStaffIndex(null);
    postMessageToSheet({ type: 'CLEAR_SELECTION' });
    setHasChanges(true);
  };

  const handleInsertStaffBelow = (index: number) => {
    console.log("[INSERT STAFF] HANDLER EXECUTED");
    setScore(prev => {
      const updatedStaves = [...prev.staves];
      if (index < 0 || index >= updatedStaves.length) return prev;

      const numMeasures = updatedStaves[0].measures.length;
      const isTreble = updatedStaves[index].clef === 'treble';
      const isBass = updatedStaves[index].clef === 'bass';

      const isPartOfPair = 
        (isTreble && index < updatedStaves.length - 1 && updatedStaves[index + 1].clef === 'bass') ||
        (isBass && index > 0 && updatedStaves[index - 1].clef === 'treble');

      if (isPartOfPair) {
        // Insert below the pair
        const insertIndex = isTreble ? index + 2 : index + 1;
        const newTreble: Staff = {
          id: 'staff_' + Math.random().toString(36).substr(2, 9),
          clef: 'treble',
          measures: getInitialMeasures(numMeasures, prev.timeSignature),
        };
        const newBass: Staff = {
          id: 'staff_' + Math.random().toString(36).substr(2, 9),
          clef: 'bass',
          measures: getInitialMeasures(numMeasures, prev.timeSignature),
        };
        updatedStaves.splice(insertIndex, 0, newTreble, newBass);
      } else {
        // Independent staff
        const insertIndex = index + 1;
        const clef = updatedStaves[index].clef; // Follow existing staff type
        const newStaff: Staff = {
          id: 'staff_' + Math.random().toString(36).substr(2, 9),
          clef: clef,
          measures: getInitialMeasures(numMeasures, prev.timeSignature),
        };
        updatedStaves.splice(insertIndex, 0, newStaff);
      }

      console.log("[INSERT STAFF] NEW STAFF COUNT", updatedStaves.length);
      return { ...prev, staves: updatedStaves };
    });
    setSelectedStaffIndex(null);
    setSelectedStaffIndices([]);
    setHasChanges(true);
  };

  const handleReorderStaves = (fromIndex: number, toIndex: number) => {
    setScore(prev => {
      const originalClefs = prev.staves.map(s => s.clef);
      const newStaves = [...prev.staves];
      if (fromIndex >= 0 && fromIndex < newStaves.length && toIndex >= 0 && toIndex < newStaves.length) {
        const [moved] = newStaves.splice(fromIndex, 1);
        newStaves.splice(toIndex, 0, moved);
      }
      // Re-assign original clefs to keep the initial clef display fixed at the vertical score positions
      const finalStaves = newStaves.map((staff, idx) => ({
        ...staff,
        clef: originalClefs[idx]
      }));
      return { ...prev, staves: finalStaves };
    });
    setSelectedStaffIndex(null);
    setSelectedStaffIndices([]);
    setHasChanges(true);
  };

  const handleCreateTie = () => {
    if (selectedNoteIds.length !== 2) return;
    const noteId1 = selectedNoteIds[0];
    const noteId2 = selectedNoteIds[1];
    if (!isTieValid(score, noteId1, noteId2)) return;

    const found1 = findNoteInScore(score, noteId1);
    const found2 = findNoteInScore(score, noteId2);
    if (!found1 || !found2) return;

    // Sort by score position: measureIndex first, then noteIndex
    let startNode = found1;
    let endNode = found2;
    if (
      found1.measureIndex > found2.measureIndex ||
      (found1.measureIndex === found2.measureIndex && found1.noteIndex > found2.noteIndex)
    ) {
      startNode = found2;
      endNode = found1;
    }

    setScore(prev => {
      const nextStaves = prev.staves.map((staff, sIdx) => {
        if (sIdx !== startNode.staffIndex) return staff;
        
        const nextMeasures = staff.measures.map((measure, mIdx) => {
          if (mIdx !== startNode.measureIndex && mIdx !== endNode.measureIndex) return measure;

          const nextNotes = measure.notes.map((note: any, nIdx: number) => {
            let updatedNote = { ...note };

            if (mIdx === startNode.measureIndex && nIdx === startNode.noteIndex) {
              const currentTie = getNoteTieState(updatedNote, startNode.pitchIndex);
              const nextTie = combineTieState(currentTie, 'start');
              updatedNote = setNoteTieState(updatedNote, startNode.pitchIndex, nextTie);
            }

            if (mIdx === endNode.measureIndex && nIdx === endNode.noteIndex) {
              const currentTie = getNoteTieState(updatedNote, endNode.pitchIndex);
              const nextTie = combineTieState(currentTie, 'stop');
              updatedNote = setNoteTieState(updatedNote, endNode.pitchIndex, nextTie);
            }

            return updatedNote;
          });

          return { ...measure, notes: nextNotes };
        });

        return { ...staff, measures: nextMeasures };
      });

      return { ...prev, staves: nextStaves };
    });

    setHasChanges(true);
  };

  const handleRemoveTie = () => {
    if (selectedNoteIds.length !== 2) return;
    const noteId1 = selectedNoteIds[0];
    const noteId2 = selectedNoteIds[1];

    const found1 = findNoteInScore(score, noteId1);
    const found2 = findNoteInScore(score, noteId2);
    if (!found1 || !found2) return;

    // Sort by score position: measureIndex first, then noteIndex
    let startNode = found1;
    let endNode = found2;
    if (
      found1.measureIndex > found2.measureIndex ||
      (found1.measureIndex === found2.measureIndex && found1.noteIndex > found2.noteIndex)
    ) {
      startNode = found2;
      endNode = found1;
    }

    setScore(prev => {
      const nextStaves = prev.staves.map((staff, sIdx) => {
        if (sIdx !== startNode.staffIndex) return staff;

        const nextMeasures = staff.measures.map((measure, mIdx) => {
          if (mIdx !== startNode.measureIndex && mIdx !== endNode.measureIndex) return measure;

          const nextNotes = measure.notes.map((note: any, nIdx: number) => {
            let updatedNote = { ...note };

            if (mIdx === startNode.measureIndex && nIdx === startNode.noteIndex) {
              const currentTie = getNoteTieState(updatedNote, startNode.pitchIndex);
              const nextTie = removeTieFromState(currentTie, 'start');
              updatedNote = setNoteTieState(updatedNote, startNode.pitchIndex, nextTie);
            }

            if (mIdx === endNode.measureIndex && nIdx === endNode.noteIndex) {
              const currentTie = getNoteTieState(updatedNote, endNode.pitchIndex);
              const nextTie = removeTieFromState(currentTie, 'stop');
              updatedNote = setNoteTieState(updatedNote, endNode.pitchIndex, nextTie);
            }

            return updatedNote;
          });

          return { ...measure, notes: nextNotes };
        });

        return { ...staff, measures: nextMeasures };
      });

      return { ...prev, staves: nextStaves };
    });

    setHasChanges(true);
  };

  const handleConnectTwoNotes = (id1: string, id2: string) => {
    const found1 = findNoteInScore(score, id1);
    const found2 = findNoteInScore(score, id2);
    if (!found1 || !found2) return;

    if (found1.staffIndex !== found2.staffIndex || found1.measureIndex !== found2.measureIndex) return;

    const staffIndex = found1.staffIndex;
    const measureIndex = found1.measureIndex;

    // Sort by noteIndex so left is first, right is second
    let leftNode = found1;
    let rightNode = found2;
    if (found1.noteIndex > found2.noteIndex) {
      leftNode = found2;
      rightNode = found1;
    }

    setScore(prev => {
      const nextStaves = prev.staves.map((staff, sIdx) => {
        if (sIdx !== staffIndex) return staff;

        const nextMeasures = staff.measures.map((measure, mIdx) => {
          if (mIdx !== measureIndex) return measure;

          // Prepare the updated notes array
          const nextNotes = measure.notes.map((note: any, nIdx: number) => {
            let updatedNote = { ...note };

            if (nIdx === leftNode.noteIndex) {
              // Set to begin a beam. Any previous connections to the left are removed.
              updatedNote.beams = ['begin'];
            } else if (nIdx === rightNode.noteIndex) {
              // Set to end a beam. Any previous connections to the right are removed.
              updatedNote.beams = ['end'];
            }

            return updatedNote;
          });

          // Run cleanInvalidBeams to clean and format the beam group structure (including hooks)
          const cleanedNotes = cleanInvalidBeams(nextNotes);

          return { ...measure, notes: cleanedNotes };
        });

        return { ...staff, measures: nextMeasures };
      });

      return { ...prev, staves: nextStaves };
    });

    setHasChanges(true);
  };

  const handleDisconnectTwoNotes = (id1: string, id2: string) => {
    const found1 = findNoteInScore(score, id1);
    const found2 = findNoteInScore(score, id2);
    if (!found1 || !found2) return;

    if (found1.staffIndex !== found2.staffIndex || found1.measureIndex !== found2.measureIndex) return;

    const staffIndex = found1.staffIndex;
    const measureIndex = found1.measureIndex;

    // Sort by noteIndex so left is first, right is second
    let leftNode = found1;
    let rightNode = found2;
    if (found1.noteIndex > found2.noteIndex) {
      leftNode = found2;
      rightNode = found1;
    }

    setScore(prev => {
      const nextStaves = prev.staves.map((staff, sIdx) => {
        if (sIdx !== staffIndex) return staff;

        const nextMeasures = staff.measures.map((measure, mIdx) => {
          if (mIdx !== measureIndex) return measure;

          const nextNotes = measure.notes.map((note: any, nIdx: number) => {
            let updatedNote = { ...note };

            if (nIdx === leftNode.noteIndex) {
              const currentLeftBeams = updatedNote.beams || [];
              const leftConnectsLeft = currentLeftBeams.length > 0 && (currentLeftBeams[0] === 'end' || currentLeftBeams[0] === 'continue');
              // Disconnect right.
              if (leftConnectsLeft) {
                updatedNote.beams = ['end'];
              } else {
                const { beams, ...rest } = updatedNote;
                updatedNote = rest;
              }
            } else if (nIdx === rightNode.noteIndex) {
              const currentRightBeams = updatedNote.beams || [];
              const rightConnectsRight = currentRightBeams.length > 0 && (currentRightBeams[0] === 'begin' || currentRightBeams[0] === 'continue');
              // Disconnect left.
              if (rightConnectsRight) {
                updatedNote.beams = ['begin'];
              } else {
                const { beams, ...rest } = updatedNote;
                updatedNote = rest;
              }
            }

            return updatedNote;
          });

          // Run cleanInvalidBeams to clean and format the remaining beam group structures
          const cleanedNotes = cleanInvalidBeams(nextNotes);

          return { ...measure, notes: cleanedNotes };
        });

        return { ...staff, measures: nextMeasures };
      });

      return { ...prev, staves: nextStaves };
    });

    setHasChanges(true);
  };

  // Measure Controls
  const handleAddMeasure = (position: 'before' | 'after' | 'append') => {
    if ((position === 'before' || position === 'after') && selectedMeasureIndex === null) {
      Alert.alert('No Selection', 'Please select a measure first.');
      return;
    }

    setScore(prev => {
      const numMeasures = prev.staves.length > 0 ? prev.staves[0].measures.length : 1;
      const localMIdx = selectedMeasureIndex !== null && numMeasures > 0 ? selectedMeasureIndex % numMeasures : 0;
      const updatedStaves = prev.staves.map(staff => {
        const newMeasures = [...staff.measures];
        const newMeasure = {
          id: 'measure_' + Math.random().toString(36).substr(2, 9),
          notes: getFillerRests(getMeasureMaxDuration(prev.timeSignature)),
        };

        if (position === 'append') {
          newMeasures.push(newMeasure);
        } else if (position === 'before' && selectedMeasureIndex !== null) {
          newMeasures.splice(localMIdx, 0, newMeasure);
        } else if (position === 'after' && selectedMeasureIndex !== null) {
          newMeasures.splice(localMIdx + 1, 0, newMeasure);
        }
        return { ...staff, measures: newMeasures };
      });
      return { ...prev, staves: updatedStaves };
    });

    if (position === 'before' && selectedMeasureIndex !== null) {
      setSelectedMeasureIndex(prev => prev !== null ? prev + 1 : null);
    }
    setHasChanges(true);
  };

  const handleDeleteMeasure = () => {
    if (selectedMeasureIndex === null) {
      Alert.alert('No Selection', 'Please select a measure first.');
      return;
    }

    if (score.staves[0].measures.length <= 1) {
      Alert.alert('Cannot Delete', 'A score must contain at least one measure.');
      return;
    }

    setScore(prev => {
      const numMeasures = prev.staves.length > 0 ? prev.staves[0].measures.length : 1;
      const localMIdx = selectedMeasureIndex !== null && numMeasures > 0 ? selectedMeasureIndex % numMeasures : 0;
      const updatedStaves = prev.staves.map(staff => {
        const newMeasures = [...staff.measures];
        newMeasures.splice(localMIdx, 1);
        return { ...staff, measures: newMeasures };
      });
      return { ...prev, staves: updatedStaves };
    });

    setSelectedMeasureIndex(null);
    setSelectedBarId(null);
    setHasChanges(true);
  };

  const handleSwapMeasures = (fromIndex: number, toIndex: number) => {
    setScore(prev => {
      const updatedStaves = prev.staves.map(staff => {
        const newMeasures = [...staff.measures];
        if (fromIndex >= 0 && fromIndex < newMeasures.length && toIndex >= 0 && toIndex < newMeasures.length) {
          const temp = newMeasures[fromIndex];
          newMeasures[fromIndex] = newMeasures[toIndex];
          newMeasures[toIndex] = temp;
        }
        return { ...staff, measures: newMeasures };
      });
      return { ...prev, staves: updatedStaves };
    });
    setSelectedMeasureIndex(null);
    setSelectedBarId(null);
    setHasChanges(true);
  };

  const handleReorderMeasures = (fromIndex: number, toIndex: number) => {
    setScore(prev => {
      const updatedStaves = prev.staves.map(staff => {
        const newMeasures = [...staff.measures];
        if (fromIndex >= 0 && fromIndex < newMeasures.length && toIndex >= 0 && toIndex < newMeasures.length) {
          const [moved] = newMeasures.splice(fromIndex, 1);
          newMeasures.splice(toIndex, 0, moved);
        }
        return { ...staff, measures: newMeasures };
      });
      return { ...prev, staves: updatedStaves };
    });
    setSelectedMeasureIndex(null);
    setHasChanges(true);
  };

  const handleMoveNoteDirectly = (noteId: string, direction: 'up' | 'down') => {
    const found = findNoteInScore(score, noteId);
    if (!found) return;
    const { staffIndex, measureIndex, noteIndex, note, pitchIndex } = found;
    if (note.isRest) return;
    
    // Break ties first!
    const scoreWithBrokenTies = breakTiesForNoteHead(score, staffIndex, measureIndex, noteIndex, pitchIndex);
    
    // Find the note in scoreWithBrokenTies
    const foundInBroken = findNoteInScore(scoreWithBrokenTies, noteId);
    if (!foundInBroken) return;
    const updatedNoteFromBroken = foundInBroken.note;
    
    const notePitches = updatedNoteFromBroken.pitches && updatedNoteFromBroken.pitches.length > 0 
      ? [...updatedNoteFromBroken.pitches] 
      : [updatedNoteFromBroken.pitch || 'C4'];
    const pIdx = pitchIndex < notePitches.length ? pitchIndex : 0;
    
    const currentPitch = notePitches[pIdx];
    const newPitch = shiftPitchDiatonically(currentPitch, direction);
    
    notePitches[pIdx] = newPitch;
    
    // Check if it's a chord
    const isChord = updatedNoteFromBroken.pitches && updatedNoteFromBroken.pitches.length > 0;
    
    // Re-order if it is a chord!
    let finalTies = updatedNoteFromBroken.ties;
    let finalPitches = notePitches;
    if (isChord) {
      const keyInfo = KEY_SIGNATURES[scoreWithBrokenTies.keySignature] || { fifths: 0, mode: 'major' };
      const pitchTiePairs = notePitches.map((p, idx) => ({
        pitch: p,
        tie: updatedNoteFromBroken.ties ? updatedNoteFromBroken.ties[idx] : undefined
      }));
      pitchTiePairs.sort((a, b) => pitchToMidi(a.pitch, keyInfo.fifths) - pitchToMidi(b.pitch, keyInfo.fifths));
      finalPitches = pitchTiePairs.map(x => x.pitch);
      finalTies = pitchTiePairs.map(x => x.tie);
    }
    
    const updatedNote = {
      ...updatedNoteFromBroken,
      pitches: isChord ? finalPitches : undefined,
      pitch: finalPitches[0],
      ties: isChord ? finalTies : undefined,
      tie: isChord ? undefined : updatedNoteFromBroken.tie
    };
    
    setScore(prev => {
      const nextStaves = prev.staves.map((staff, sIdx) => {
        if (sIdx === staffIndex) {
          const nextMeasures = staff.measures.map((measure, mIdx) => {
            if (mIdx === measureIndex) {
              const nextNotes = [...measure.notes];
              nextNotes[noteIndex] = updatedNote;
              return { ...measure, notes: nextNotes };
            }
            return measure;
          });
          return { ...staff, measures: nextMeasures };
        }
        return staff;
      });
      return { ...prev, staves: nextStaves };
    });
    setHasChanges(true);
  };

  const handleInsertNote = (type: string, isRest: boolean) => {
    const selectedBarId = selectedBarIdRef.current;
    const selectedMeasureIndex = selectedMeasureIndexRef.current;
    const selectedStaffIndex = selectedStaffIndexRef.current;

    console.log(
      "INSERTING NOTE INTO",
      {
        selectedBarId,
        selectedMeasureIndex,
        selectedStaffIndex
      }
    );

    let staffIdx = 0;
    let measureIdx = 0;
    let resolved = false;

    if (selectedBarId) {
      const parts = selectedBarId.split('_');
      if (parts.length >= 2) {
        const staffPart = parts[0];
        const measurePart = parts[1];
        
        let staffNumber = 1;
        if (staffPart === 'treble') {
          staffNumber = 1;
        } else if (staffPart === 'bass') {
          staffNumber = 2;
        } else if (staffPart.startsWith('staff')) {
          staffNumber = parseInt(staffPart.replace('staff', '')) || 1;
        } else {
          staffNumber = parseInt(staffPart) || 1;
        }
        
        const measureNumber = parseInt(measurePart.replace('m', '')) || 1;
        
        const partsPartition: Staff[][] = [];
        for (let i = 0; i < score.staves.length; i++) {
          if (i < score.staves.length - 1 && score.staves[i].clef === 'treble' && score.staves[i+1].clef === 'bass') {
            partsPartition.push([score.staves[i], score.staves[i+1]]);
            i++;
          } else {
            partsPartition.push([score.staves[i]]);
          }
        }
        const numMeasures = score.staves.length > 0 ? score.staves[0].measures.length : 4;
        const partIdx = Math.floor((measureNumber - 1) / numMeasures);
        measureIdx = (measureNumber - 1) % numMeasures;
        
        let resolvedStaffIndex = 0;
        for (let p = 0; p < partIdx; p++) {
          resolvedStaffIndex += partsPartition[p] ? partsPartition[p].length : 1;
        }
        const priorStavesCount = resolvedStaffIndex;
        const currentPartStaves = partsPartition[partIdx] || [];
        const localStaffIdx = Math.max(0, Math.min(staffNumber - 1 - priorStavesCount, Math.max(currentPartStaves.length - 1, 0)));
        resolvedStaffIndex += localStaffIdx;
        
        staffIdx = resolvedStaffIndex;
        resolved = true;
      }
    }

    if (!resolved) {
      if (selectedMeasureIndex !== null && !isNaN(selectedMeasureIndex)) {
        measureIdx = selectedMeasureIndex;
      } else {
        console.warn("handleInsertNote: no valid measure selected");
        return;
      }
      
      if (selectedStaffIndex !== null && !isNaN(selectedStaffIndex) && selectedStaffIndex >= 0 && selectedStaffIndex < score.staves.length) {
        staffIdx = selectedStaffIndex;
      } else {
        const editStaff = editingStaffIndexRef.current;
        if (typeof editStaff === 'number' && !isNaN(editStaff) && editStaff >= 0 && editStaff < score.staves.length) {
          staffIdx = editStaff;
        }
      }
    }

    if (staffIdx < 0 || staffIdx >= score.staves.length) {
      console.warn("handleInsertNote: invalid staff index", staffIdx);
      return;
    }
    
    const numMeasures = score.staves[staffIdx].measures.length;
    const localMIdx = numMeasures > 0 ? measureIdx % numMeasures : 0;
    if (localMIdx < 0 || localMIdx >= numMeasures) {
      console.warn("handleInsertNote: selectedMeasureIndex out of bounds", measureIdx);
      return;
    }

    const selectedMeasure = localMIdx;

    const baseDur = NOTE_TYPE_BASE_DURS[type] || 256;
    const maxDur = getMeasureMaxDuration(score.timeSignature);
    
    const currentNotes = score.staves[staffIdx].measures[selectedMeasure].notes || [];
    
    // Calculate total user-inserted duration
    const userNotes = currentNotes.filter((n: any) => !n.isAutoGenerated);
    const userDur = userNotes.reduce((sum: number, n: any) => sum + n.duration, 0);
    
    if (userDur + baseDur > maxDur) {
      Alert.alert('Measure is already full', 'Adding this note would exceed the time signature limit.');
      return;
    }
    
    // Create the new note
    const newNote = {
      id: 'note_' + Math.random().toString(36).substr(2, 9),
      pitch: isRest ? 'rest' : (score.staves[staffIdx]?.clef === 'treble' ? 'C5' : (score.staves[staffIdx]?.clef === 'bass' ? 'C3' : 'C4')),
      isRest: isRest,
      type: type,
      duration: baseDur,
      dot: false,
    };
    
    // Append new note to user notes, then recalculate rests
    const updatedUserNotes = [...userNotes, newNote];
    const newNotesList = recalculateMeasureRests(updatedUserNotes, score.timeSignature);
    
    // Update state non-mutatingly
    setScore(prev => {
      const nextStaves = prev.staves.map((staff, sIdx) => {
        if (sIdx === staffIdx) {
          const nextMeasures = staff.measures.map((measure, mIdx) => {
            if (mIdx === selectedMeasure) {
              return {
                ...measure,
                notes: newNotesList
              };
            }
            return measure;
          });
          return {
            ...staff,
            measures: nextMeasures
          };
        }
        return staff;
      });
      return { ...prev, staves: nextStaves };
    });
    
    // Select the newly added note
    setSelectedNoteIndex(updatedUserNotes.length - 1);
    setSelectedEditItemId(null);
    setSelectedNoteId(null);
    setSelectedNoteIds([]);
    setHasChanges(true);
  };



  const handleReplaceItem = (type: string, isRest: boolean) => {
    if (!selectedEditItemId) return;
    
    // Find the item in the score
    const found = findNoteInScore(score, selectedEditItemId);
    if (!found) return;
    
    const { staffIndex, measureIndex, noteIndex, note } = found;
    
    const baseDur = NOTE_TYPE_BASE_DURS[type] || 256;
    const currentNotes = [...score.staves[staffIndex].measures[measureIndex].notes];
    
    let itemsToReplaceCount = 0;
    let accumulated = 0;
    
    if (note.isRest) {
      // Selected item is a rest
      if (baseDur > note.duration) {
        // Merge rests to the right
        for (let i = noteIndex; i < currentNotes.length; i++) {
          if (currentNotes[i].isRest) {
            accumulated += currentNotes[i].duration;
            itemsToReplaceCount++;
            if (accumulated >= baseDur) {
              break;
            }
          } else {
            break;
          }
        }
        if (accumulated < baseDur) {
          Alert.alert('Cannot Merge Rests', 'Not enough consecutive rests to the right to merge into this duration.');
          return;
        }
      } else {
        // Split rest (or replace in-place)
        accumulated = note.duration;
        itemsToReplaceCount = 1;
      }
    } else {
      // Selected item is a note
      // 1. Calculate the total available duration from noteIndex to the end of the measure
      let availDur = 0;
      for (let i = noteIndex; i < currentNotes.length; i++) {
        availDur += currentNotes[i].duration;
      }
      
      if (baseDur > availDur) {
        Alert.alert('Not enough room', 'Replacing with this duration would exceed the measure boundary.');
        return;
      }
      
      // 2. Consume subsequent items
      for (let i = noteIndex; i < currentNotes.length; i++) {
        accumulated += currentNotes[i].duration;
        itemsToReplaceCount++;
        if (accumulated >= baseDur) {
          break;
        }
      }
    }
    
    // 3. Create the new note or rest
    const newItem = {
      id: 'note_' + Math.random().toString(36).substr(2, 9),
      pitch: isRest ? 'rest' : (note.isRest ? (score.staves[staffIndex]?.clef === 'treble' ? 'C5' : (score.staves[staffIndex]?.clef === 'bass' ? 'C3' : 'C4')) : note.pitch),
      isRest: isRest,
      type: type,
      duration: baseDur,
      dot: false,
    };
    
    // 4. Generate fillers
    const remainder = accumulated - baseDur;
    const fillers = getFillerRests(remainder);
    
    // 5. Splice
    const newNotes = [...currentNotes];
    newNotes.splice(noteIndex, itemsToReplaceCount, newItem, ...fillers);
    const cleanedNotes = cleanInvalidBeams(newNotes);
    
    // 6. Update state
    setScore(prev => {
      const nextStaves = prev.staves.map((staff, sIdx) => {
        if (sIdx === staffIndex) {
          const nextMeasures = staff.measures.map((measure, mIdx) => {
            if (mIdx === measureIndex) {
              return {
                ...measure,
                notes: cleanedNotes
              };
            }
            return measure;
          });
          return {
            ...staff,
            measures: nextMeasures
          };
        }
        return staff;
      });
      return { ...prev, staves: nextStaves };
    });
    
    setSelectedEditItemId(newItem.id);
    setHasChanges(true);
  };

  const handleUpdateEditItemPitch = (modifications: { step?: string; accidental?: string; octave?: string }) => {
    if (!selectedEditItemId) return;
    const found = findNoteInScore(score, selectedEditItemId);
    if (!found || found.note.isRest) return;
    
    const { staffIndex, measureIndex, noteIndex, note, pitchIndex } = found;
    
    // Break ties first!
    const scoreWithBrokenTies = breakTiesForNoteHead(score, staffIndex, measureIndex, noteIndex, pitchIndex);
    
    // Find note in scoreWithBrokenTies
    const foundInBroken = findNoteInScore(scoreWithBrokenTies, selectedEditItemId);
    if (!foundInBroken) return;
    const updatedNoteFromBroken = foundInBroken.note;
    
    let notePitches = updatedNoteFromBroken.pitches && updatedNoteFromBroken.pitches.length > 0 
      ? [...updatedNoteFromBroken.pitches] 
      : [updatedNoteFromBroken.pitch || 'C4'];
    const pIdx = pitchIndex < notePitches.length ? pitchIndex : 0;
    
    const currentPitch = notePitches[pIdx];
    const pitchParts = getPitchParts(currentPitch);
    const newParts = { ...pitchParts, ...modifications };
    const newPitch = `${newParts.step}${newParts.accidental}${newParts.octave}`;
    
    notePitches[pIdx] = newPitch;
    
    const isChord = updatedNoteFromBroken.pitches && updatedNoteFromBroken.pitches.length > 0;
    let finalTies = updatedNoteFromBroken.ties;
    let finalPitches = notePitches;
    if (isChord) {
      const keyInfo = KEY_SIGNATURES[scoreWithBrokenTies.keySignature] || { fifths: 0, mode: 'major' };
      const pitchTiePairs = notePitches.map((p, idx) => ({
        pitch: p,
        tie: updatedNoteFromBroken.ties ? updatedNoteFromBroken.ties[idx] : undefined
      }));
      pitchTiePairs.sort((a, b) => pitchToMidi(a.pitch, keyInfo.fifths) - pitchToMidi(b.pitch, keyInfo.fifths));
      finalPitches = pitchTiePairs.map(x => x.pitch);
      finalTies = pitchTiePairs.map(x => x.tie);
    }
    
    const updatedNote = {
      ...updatedNoteFromBroken,
      pitches: isChord ? finalPitches : undefined,
      pitch: finalPitches[0],
      ties: isChord ? finalTies : undefined,
      tie: isChord ? undefined : updatedNoteFromBroken.tie
    };
    
    setScore(prev => {
      const nextStaves = prev.staves.map((staff, sIdx) => {
        if (sIdx === staffIndex) {
          const nextMeasures = staff.measures.map((measure, mIdx) => {
            if (mIdx === measureIndex) {
              const nextNotes = [...measure.notes];
              nextNotes[noteIndex] = updatedNote;
              return {
                ...measure,
                notes: nextNotes
              };
            }
            return measure;
          });
          return {
            ...staff,
            measures: nextMeasures
          };
        }
        return staff;
      });
      return { ...prev, staves: nextStaves };
    });
    setHasChanges(true);
  };

  const handleShiftDiatonically = (direction: 'up' | 'down') => {
    if (!selectedEditItemId) return;
    const found = findNoteInScore(score, selectedEditItemId);
    if (!found || found.note.isRest) return;
    
    const { staffIndex, measureIndex, noteIndex, note, pitchIndex } = found;
    
    // Break ties first!
    const scoreWithBrokenTies = breakTiesForNoteHead(score, staffIndex, measureIndex, noteIndex, pitchIndex);
    
    // Find note in scoreWithBrokenTies
    const foundInBroken = findNoteInScore(scoreWithBrokenTies, selectedEditItemId);
    if (!foundInBroken) return;
    const updatedNoteFromBroken = foundInBroken.note;
    
    let notePitches = updatedNoteFromBroken.pitches && updatedNoteFromBroken.pitches.length > 0 
      ? [...updatedNoteFromBroken.pitches] 
      : [updatedNoteFromBroken.pitch || 'C4'];
    const pIdx = pitchIndex < notePitches.length ? pitchIndex : 0;
    
    const currentPitch = notePitches[pIdx];
    const newPitch = shiftPitchDiatonically(currentPitch, direction);
    
    // Validate uniqueness
    const otherPitches = notePitches.filter((_, idx) => idx !== pIdx);
    if (otherPitches.includes(newPitch)) {
      Alert.alert('Duplicate Pitch', 'A chord cannot contain duplicate pitches.');
      return;
    }
    
    notePitches[pIdx] = newPitch;
    
    const isChord = updatedNoteFromBroken.pitches && updatedNoteFromBroken.pitches.length > 0;
    let finalTies = updatedNoteFromBroken.ties;
    let finalPitches = notePitches;
    if (isChord) {
      const keyInfo = KEY_SIGNATURES[scoreWithBrokenTies.keySignature] || { fifths: 0, mode: 'major' };
      const pitchTiePairs = notePitches.map((p, idx) => ({
        pitch: p,
        tie: updatedNoteFromBroken.ties ? updatedNoteFromBroken.ties[idx] : undefined
      }));
      pitchTiePairs.sort((a, b) => pitchToMidi(a.pitch, keyInfo.fifths) - pitchToMidi(b.pitch, keyInfo.fifths));
      finalPitches = pitchTiePairs.map(x => x.pitch);
      finalTies = pitchTiePairs.map(x => x.tie);
    }
    
    const updatedNote = {
      ...updatedNoteFromBroken,
      pitches: isChord ? finalPitches : undefined,
      pitch: finalPitches[0],
      ties: isChord ? finalTies : undefined,
      tie: isChord ? undefined : updatedNoteFromBroken.tie
    };
    
    setScore(prev => {
      const nextStaves = prev.staves.map((staff, sIdx) => {
        if (sIdx === staffIndex) {
          const nextMeasures = staff.measures.map((measure, mIdx) => {
            if (mIdx === measureIndex) {
              const nextNotes = [...measure.notes];
              nextNotes[noteIndex] = updatedNote;
              return {
                ...measure,
                notes: nextNotes
              };
            }
            return measure;
          });
          return {
            ...staff,
            measures: nextMeasures
          };
        }
        return staff;
      });
      return { ...prev, staves: nextStaves };
    });
    
    const newIndex = finalPitches.indexOf(newPitch);
    setSelectedPitchIndex(newIndex !== -1 ? newIndex : 0);
    setHasChanges(true);
  };

  const handleSetAccidental = (acc: '#' | 'b' | 'n' | '') => {
    if (!selectedEditItemId) return;
    const found = findNoteInScore(score, selectedEditItemId);
    if (!found || found.note.isRest) return;
    
    const { staffIndex, measureIndex, noteIndex, note, pitchIndex } = found;
    
    // Break ties first!
    const scoreWithBrokenTies = breakTiesForNoteHead(score, staffIndex, measureIndex, noteIndex, pitchIndex);
    
    // Find note in scoreWithBrokenTies
    const foundInBroken = findNoteInScore(scoreWithBrokenTies, selectedEditItemId);
    if (!foundInBroken) return;
    const updatedNoteFromBroken = foundInBroken.note;
    
    let notePitches = updatedNoteFromBroken.pitches && updatedNoteFromBroken.pitches.length > 0 
      ? [...updatedNoteFromBroken.pitches] 
      : [updatedNoteFromBroken.pitch || 'C4'];
    const pIdx = pitchIndex < notePitches.length ? pitchIndex : 0;
    
    const currentPitch = notePitches[pIdx];
    const parts = getPitchParts(currentPitch);
    
    // Toggle accidental for sharp/flat/natural
    let newAcc = '';
    if (acc === '#' || acc === 'b' || acc === 'n') {
      newAcc = parts.accidental === acc ? '' : acc;
    }
    const newPitch = `${parts.step}${newAcc}${parts.octave}`;
    
    // Validate uniqueness
    const otherPitches = notePitches.filter((_, idx) => idx !== pIdx);
    if (otherPitches.includes(newPitch)) {
      Alert.alert('Duplicate Pitch', 'A chord cannot contain duplicate pitches.');
      return;
    }
    
    notePitches[pIdx] = newPitch;
    
    const isChord = updatedNoteFromBroken.pitches && updatedNoteFromBroken.pitches.length > 0;
    let finalTies = updatedNoteFromBroken.ties;
    let finalPitches = notePitches;
    if (isChord) {
      const keyInfo = KEY_SIGNATURES[scoreWithBrokenTies.keySignature] || { fifths: 0, mode: 'major' };
      const pitchTiePairs = notePitches.map((p, idx) => ({
        pitch: p,
        tie: updatedNoteFromBroken.ties ? updatedNoteFromBroken.ties[idx] : undefined
      }));
      pitchTiePairs.sort((a, b) => pitchToMidi(a.pitch, keyInfo.fifths) - pitchToMidi(b.pitch, keyInfo.fifths));
      finalPitches = pitchTiePairs.map(x => x.pitch);
      finalTies = pitchTiePairs.map(x => x.tie);
    }
    
    const updatedNote = {
      ...updatedNoteFromBroken,
      pitches: isChord ? finalPitches : undefined,
      pitch: finalPitches[0],
      ties: isChord ? finalTies : undefined,
      tie: isChord ? undefined : updatedNoteFromBroken.tie
    };
    
    setScore(prev => {
      const nextStaves = prev.staves.map((staff, sIdx) => {
        if (sIdx === staffIndex) {
          const nextMeasures = staff.measures.map((measure, mIdx) => {
            if (mIdx === measureIndex) {
              const nextNotes = [...measure.notes];
              nextNotes[noteIndex] = updatedNote;
              return {
                ...measure,
                notes: nextNotes
              };
            }
            return measure;
          });
          return {
            ...staff,
            measures: nextMeasures
          };
        }
        return staff;
      });
      return { ...prev, staves: nextStaves };
    });
    
    const newIndex = finalPitches.indexOf(newPitch);
    setSelectedPitchIndex(newIndex !== -1 ? newIndex : 0);
    setHasChanges(true);
  };

  const handleAddNoteHead = () => {
    if (!selectedEditItemId) return;
    const found = findNoteInScore(score, selectedEditItemId);
    if (!found || found.note.isRest) return;
    
    const { staffIndex, measureIndex, noteIndex, note } = found;
    let notePitches = note.pitches && note.pitches.length > 0 ? [...note.pitches] : [note.pitch || 'C4'];
    
    const pIdx = selectedPitchIndex < notePitches.length ? selectedPitchIndex : 0;
    const currentPitch = notePitches[pIdx];
    const currentMidi = pitchToMidi(currentPitch);
    
    // Try to stack a third (4 semitones) above first
    let targetMidi = currentMidi + 4;
    let direction = 1;
    
    const midis = notePitches.map(p => pitchToMidi(p));
    while (midis.includes(targetMidi) || notePitches.includes(midiToPitch(targetMidi))) {
      targetMidi += direction;
      if (targetMidi > 96) {
        direction = -1;
        targetMidi = currentMidi - 4;
      }
      if (targetMidi < 36) {
        targetMidi = 36;
        while (midis.includes(targetMidi) || notePitches.includes(midiToPitch(targetMidi))) {
          targetMidi++;
        }
        break;
      }
    }
    
    const newPitch = midiToPitch(targetMidi);
    notePitches.push(newPitch);
    notePitches.sort((a, b) => pitchToMidi(a) - pitchToMidi(b));
    
    const updatedNote = {
      ...note,
      pitches: notePitches,
      pitch: notePitches[0]
    };
    
    setScore(prev => {
      const nextStaves = prev.staves.map((staff, sIdx) => {
        if (sIdx === staffIndex) {
          const nextMeasures = staff.measures.map((measure, mIdx) => {
            if (mIdx === measureIndex) {
              const nextNotes = [...measure.notes];
              nextNotes[noteIndex] = updatedNote;
              return {
                ...measure,
                notes: nextNotes
              };
            }
            return measure;
          });
          return {
            ...staff,
            measures: nextMeasures
          };
        }
        return staff;
      });
      return { ...prev, staves: nextStaves };
    });
    
    const newIndex = notePitches.indexOf(newPitch);
    setSelectedPitchIndex(newIndex !== -1 ? newIndex : notePitches.length - 1);
    setHasChanges(true);
  };

  const handleRemoveNoteHead = () => {
    if (!selectedEditItemId) return;
    const found = findNoteInScore(score, selectedEditItemId);
    if (!found || found.note.isRest) return;
    
    const { staffIndex, measureIndex, noteIndex, note } = found;
    let notePitches = note.pitches && note.pitches.length > 0 ? [...note.pitches] : [note.pitch || 'C4'];
    
    if (notePitches.length <= 1) {
      handleDeleteEditItem();
      return;
    }
    
    const pIdx = selectedPitchIndex < notePitches.length ? selectedPitchIndex : 0;
    notePitches.splice(pIdx, 1);
    
    const updatedNote = {
      ...note,
      pitches: notePitches,
      pitch: notePitches[0]
    };
    
    setScore(prev => {
      const nextStaves = prev.staves.map((staff, sIdx) => {
        if (sIdx === staffIndex) {
          const nextMeasures = staff.measures.map((measure, mIdx) => {
            if (mIdx === measureIndex) {
              const nextNotes = [...measure.notes];
              nextNotes[noteIndex] = updatedNote;
              return {
                ...measure,
                notes: nextNotes
              };
            }
            return measure;
          });
          return {
            ...staff,
            measures: nextMeasures
          };
        }
        return staff;
      });
      return { ...prev, staves: nextStaves };
    });
    
    setSelectedPitchIndex(0);
    setHasChanges(true);
  };

  const handleClearMeasure = () => {
    if (selectedMeasureIndex === null) return;
    const maxDur = getMeasureMaxDuration(score.timeSignature);
    const newNotes = getFillerRests(maxDur);
    
    setScore(prev => {
      const nextStaves = prev.staves.map((staff, sIdx) => {
        if (sIdx === editingStaffIndex) {
          const numMeasures = staff.measures.length;
          const localMIdx = numMeasures > 0 ? selectedMeasureIndex % numMeasures : 0;
          const nextMeasures = staff.measures.map((measure, mIdx) => {
            if (mIdx === localMIdx) {
              return {
                ...measure,
                notes: newNotes
              };
            }
            return measure;
          });
          return {
            ...staff,
            measures: nextMeasures
          };
        }
        return staff;
      });
      return { ...prev, staves: nextStaves };
    });
    
    setSelectedEditItemId(null);
    setSelectedPitchIndex(0);
    setHasChanges(true);
  };

  const handleConnectNotes = () => {
    if (!selectedEditItemId) return;
    const found = findNoteInScore(score, selectedEditItemId);
    if (!found) return;
    
    const { staffIndex, measureIndex, noteIndex } = found;
    const currentNotes = [...score.staves[staffIndex].measures[measureIndex].notes];
    const targetNote = currentNotes[noteIndex];
    if (targetNote.isRest) return;
    
    const targetType = targetNote.type;
    if (targetType !== 'eighth' && targetType !== '16th') return;
    
    const isConnectedToLeft = targetNote.beams && targetNote.beams.length > 0 && (targetNote.beams[0] === 'end' || targetNote.beams[0] === 'continue');
    const isConnectedToRight = targetNote.beams && targetNote.beams.length > 0 && (targetNote.beams[0] === 'begin' || targetNote.beams[0] === 'continue');
    
    if (isConnectedToLeft && isConnectedToRight) return;
    
    const isCompatible = (n: any) => {
      if (!n || n.isRest) return false;
      return n.type === 'eighth' || n.type === '16th';
    };
    
    let updatedNotes = [...currentNotes];
    let nextSelectedId: string | null = null;
    
    const setBeamState = (note: any, state: 'begin' | 'continue' | 'end' | null) => {
      if (state === null) {
        const { beams, ...rest } = note;
        return rest;
      }
      const numBeams = note.type === '16th' ? 2 : 1;
      return {
        ...note,
        beams: Array(numBeams).fill(state)
      };
    };
    
    if (isConnectedToLeft) {
      // Connect to right
      if (noteIndex + 1 < currentNotes.length && isCompatible(currentNotes[noteIndex + 1])) {
        const rightNote = currentNotes[noteIndex + 1];
        const rightConnectedToRight = rightNote.beams && rightNote.beams.length > 0 && (rightNote.beams[0] === 'begin' || rightNote.beams[0] === 'continue');
        updatedNotes[noteIndex] = setBeamState(targetNote, 'continue');
        updatedNotes[noteIndex + 1] = setBeamState(rightNote, rightConnectedToRight ? 'continue' : 'end');
        nextSelectedId = rightNote.id;
      }
    } else if (isConnectedToRight) {
      // Connect to left
      if (noteIndex - 1 >= 0 && isCompatible(currentNotes[noteIndex - 1])) {
        const leftNote = currentNotes[noteIndex - 1];
        const leftConnectedToLeft = leftNote.beams && leftNote.beams.length > 0 && (leftNote.beams[0] === 'end' || leftNote.beams[0] === 'continue');
        updatedNotes[noteIndex] = setBeamState(targetNote, 'continue');
        updatedNotes[noteIndex - 1] = setBeamState(leftNote, leftConnectedToLeft ? 'continue' : 'begin');
        nextSelectedId = leftNote.id;
      }
    } else {
      // Connect to right if possible, else left
      if (noteIndex + 1 < currentNotes.length && isCompatible(currentNotes[noteIndex + 1])) {
        const rightNote = currentNotes[noteIndex + 1];
        const rightConnectedToRight = rightNote.beams && rightNote.beams.length > 0 && (rightNote.beams[0] === 'begin' || rightNote.beams[0] === 'continue');
        updatedNotes[noteIndex] = setBeamState(targetNote, 'begin');
        updatedNotes[noteIndex + 1] = setBeamState(rightNote, rightConnectedToRight ? 'continue' : 'end');
        nextSelectedId = rightNote.id;
      } else if (noteIndex - 1 >= 0 && isCompatible(currentNotes[noteIndex - 1])) {
        const leftNote = currentNotes[noteIndex - 1];
        const leftConnectedToLeft = leftNote.beams && leftNote.beams.length > 0 && (leftNote.beams[0] === 'end' || leftNote.beams[0] === 'continue');
        updatedNotes[noteIndex] = setBeamState(targetNote, 'end');
        updatedNotes[noteIndex - 1] = setBeamState(leftNote, leftConnectedToLeft ? 'continue' : 'begin');
        nextSelectedId = leftNote.id;
      }
    }
    
    setScore(prev => {
      const nextStaves = prev.staves.map((staff, sIdx) => {
        if (sIdx === staffIndex) {
          const nextMeasures = staff.measures.map((measure, mIdx) => {
            if (mIdx === measureIndex) {
              return {
                ...measure,
                notes: cleanInvalidBeams(updatedNotes)
              };
            }
            return measure;
          });
          return {
            ...staff,
            measures: nextMeasures
          };
        }
        return staff;
      });
      return { ...prev, staves: nextStaves };
    });
    if (nextSelectedId) {
      setSelectedEditItemId(nextSelectedId);
    }
    setHasChanges(true);
  };

  const handleInsertNoteAfter = (isRest: boolean = false) => {
    if (!selectedEditItemId) return;
    const found = findNoteInScore(score, selectedEditItemId);
    if (!found) return;
    
    const { staffIndex, measureIndex, noteIndex, note } = found;
    const currentNotes = [...score.staves[staffIndex].measures[measureIndex].notes];
    
    const baseDur = note.duration;
    const maxDur = getMeasureMaxDuration(score.timeSignature);
    
    // Calculate user notes duration excluding auto-generated rests
    const userNotes = currentNotes.filter((n: any) => !n.isAutoGenerated);
    const userDur = userNotes.reduce((sum: number, n: any) => sum + n.duration, 0);
    
    if (userDur + baseDur > maxDur) {
      Alert.alert('Measure is full', 'Cannot insert note because the measure is already full of notes.');
      return;
    }
    
    // Create new note duplicating selected note's properties (or default pitch if rest)
    const newNote = {
      id: 'note_' + Math.random().toString(36).substr(2, 9),
      pitch: isRest ? 'rest' : (note.isRest ? (score.staves[staffIndex]?.clef === 'treble' ? 'C5' : (score.staves[staffIndex]?.clef === 'bass' ? 'C3' : 'C4')) : note.pitch),
      pitches: isRest ? undefined : (note.pitches ? [...note.pitches] : (note.pitch ? [note.pitch] : undefined)),
      isRest: isRest,
      type: note.type,
      duration: baseDur,
      dot: note.dot,
    };
    
    // Insert newNote immediately after noteIndex
    const newNotes = [...currentNotes];
    newNotes.splice(noteIndex + 1, 0, newNote);
    
    // Recalculate rests to fit the measure
    const recalculated = recalculateMeasureRests(newNotes, score.timeSignature);
    
    setScore(prev => {
      const nextStaves = prev.staves.map((staff, sIdx) => {
        if (sIdx === staffIndex) {
          const nextMeasures = staff.measures.map((measure, mIdx) => {
            if (mIdx === measureIndex) {
              return {
                ...measure,
                notes: recalculated
              };
            }
            return measure;
          });
          return {
            ...staff,
            measures: nextMeasures
          };
        }
        return staff;
      });
      return { ...prev, staves: nextStaves };
    });
    
    setSelectedEditItemId(newNote.id);
    setSelectedPitchIndex(0);
    setHasChanges(true);
  };

  const handleInsertNoteAfterSpecific = (type: string, isRest: boolean) => {
    if (!selectedEditItemId) return;
    const found = findNoteInScore(score, selectedEditItemId);
    if (!found) return;
    
    const { staffIndex, measureIndex, noteIndex } = found;
    const currentNotes = [...score.staves[staffIndex].measures[measureIndex].notes];
    
    const baseDur = NOTE_TYPE_BASE_DURS[type] || 256;
    const maxDur = getMeasureMaxDuration(score.timeSignature);
    
    const userNotes = currentNotes.filter((n: any) => !n.isAutoGenerated);
    const userDur = userNotes.reduce((sum: number, n: any) => sum + n.duration, 0);
    
    if (userDur + baseDur > maxDur) {
      Alert.alert('Measure is full', 'Cannot insert note because the measure is already full of notes.');
      return;
    }
    
    const newNote = {
      id: 'note_' + Math.random().toString(36).substr(2, 9),
      pitch: isRest ? 'rest' : (score.staves[staffIndex]?.clef === 'treble' ? 'C5' : (score.staves[staffIndex]?.clef === 'bass' ? 'C3' : 'C4')),
      isRest: isRest,
      type: type,
      duration: baseDur,
      dot: false,
    };
    
    const newNotes = [...currentNotes];
    newNotes.splice(noteIndex + 1, 0, newNote);
    
    const recalculated = recalculateMeasureRests(newNotes, score.timeSignature);
    
    setScore(prev => {
      const nextStaves = prev.staves.map((staff, sIdx) => {
        if (sIdx === staffIndex) {
          const nextMeasures = staff.measures.map((measure, mIdx) => {
            if (mIdx === measureIndex) {
              return {
                ...measure,
                notes: recalculated
              };
            }
            return measure;
          });
          return {
            ...staff,
            measures: nextMeasures
          };
        }
        return staff;
      });
      return { ...prev, staves: nextStaves };
    });
    
    setSelectedEditItemId(newNote.id);
    setSelectedPitchIndex(0);
    setHasChanges(true);
  };

  const handleToggleDot = () => {
    if (!selectedEditItemId) return;
    const found = findNoteInScore(score, selectedEditItemId);
    if (!found) return;
    
    const { staffIndex, measureIndex, noteIndex, note } = found;
    const newDot = !note.dot;
    const baseDur = NOTE_TYPE_BASE_DURS[note.type] || 256;
    const newDuration = newDot ? Math.round(baseDur * 1.5) : baseDur;
    
    const currentNotes = [...score.staves[staffIndex].measures[measureIndex].notes];
    const diff = newDuration - note.duration;
    
    if (diff > 0) {
      // Consume subsequent notes/rests
      let availDur = 0;
      for (let i = noteIndex + 1; i < currentNotes.length; i++) {
        availDur += currentNotes[i].duration;
      }
      
      if (diff > availDur) {
        Alert.alert('Not enough room', 'Dotting this note would exceed the measure boundary.');
        return;
      }
      
      let accumulated = 0;
      let itemsToReplaceCount = 0;
      for (let i = noteIndex + 1; i < currentNotes.length; i++) {
        accumulated += currentNotes[i].duration;
        itemsToReplaceCount++;
        if (accumulated >= diff) {
          break;
        }
      }
      
      const remainder = accumulated - diff;
      const fillers = getFillerRests(remainder);
      
      const updatedNote = {
        ...note,
        dot: newDot,
        duration: newDuration
      };
      
      const newNotes = [...currentNotes];
      newNotes[noteIndex] = updatedNote;
      newNotes.splice(noteIndex + 1, itemsToReplaceCount, ...fillers);
      const cleanedNotes = cleanInvalidBeams(newNotes);
      
      setScore(prev => {
        const nextStaves = prev.staves.map((staff, sIdx) => {
          if (sIdx === staffIndex) {
            const nextMeasures = staff.measures.map((measure, mIdx) => {
              if (mIdx === measureIndex) {
                return {
                  ...measure,
                  notes: cleanedNotes
                };
              }
              return measure;
            });
            return {
              ...staff,
              measures: nextMeasures
            };
          }
          return staff;
        });
        return { ...prev, staves: nextStaves };
      });
      setHasChanges(true);
      
    } else if (diff < 0) {
      // Adding padding rest after note
      const addDur = Math.abs(diff);
      const fillers = getFillerRests(addDur);
      
      const updatedNote = {
        ...note,
        dot: newDot,
        duration: newDuration
      };
      
      const newNotes = [...currentNotes];
      newNotes[noteIndex] = updatedNote;
      newNotes.splice(noteIndex + 1, 0, ...fillers);
      const cleanedNotes = cleanInvalidBeams(newNotes);
      
      setScore(prev => {
        const nextStaves = prev.staves.map((staff, sIdx) => {
          if (sIdx === staffIndex) {
            const nextMeasures = staff.measures.map((measure, mIdx) => {
              if (mIdx === measureIndex) {
                return {
                  ...measure,
                  notes: cleanedNotes
                };
              }
              return measure;
            });
            return {
              ...staff,
              measures: nextMeasures
            };
          }
          return staff;
        });
        return { ...prev, staves: nextStaves };
      });
      setHasChanges(true);
    }
  };

  const handleDisconnectNotes = () => {
    if (!selectedEditItemId) return;
    const found = findNoteInScore(score, selectedEditItemId);
    if (!found) return;
    
    const { staffIndex, measureIndex, noteIndex } = found;
    const currentNotes = [...score.staves[staffIndex].measures[measureIndex].notes];
    const targetNote = currentNotes[noteIndex];
    if (targetNote.isRest) return;
    
    if (!targetNote.beams || targetNote.beams.length === 0) return;
    
    const isConnectedToLeft = targetNote.beams[0] === 'end' || targetNote.beams[0] === 'continue';
    const isConnectedToRight = targetNote.beams[0] === 'begin' || targetNote.beams[0] === 'continue';
    
    let updatedNotes = [...currentNotes];
    
    const setBeamState = (note: any, state: 'begin' | 'continue' | 'end' | null) => {
      if (state === null) {
        const { beams, ...rest } = note;
        return rest;
      }
      const numBeams = note.type === '16th' ? 2 : 1;
      return {
        ...note,
        beams: Array(numBeams).fill(state)
      };
    };
    
    if (isConnectedToLeft && isConnectedToRight) {
      // Disconnect the right connection, left stays.
      updatedNotes[noteIndex] = setBeamState(targetNote, 'end');
      if (noteIndex + 1 < currentNotes.length) {
        const rightNote = currentNotes[noteIndex + 1];
        const rightConnectedToRight = rightNote.beams && rightNote.beams.length > 0 && (rightNote.beams[0] === 'begin' || rightNote.beams[0] === 'continue');
        updatedNotes[noteIndex + 1] = setBeamState(rightNote, rightConnectedToRight ? 'begin' : null);
      }
    } else if (isConnectedToLeft) {
      // Connected only to left. Disconnect left.
      updatedNotes[noteIndex] = setBeamState(targetNote, null);
      if (noteIndex - 1 >= 0) {
        const leftNote = currentNotes[noteIndex - 1];
        const leftConnectedToLeft = leftNote.beams && leftNote.beams.length > 0 && (leftNote.beams[0] === 'end' || leftNote.beams[0] === 'continue');
        updatedNotes[noteIndex - 1] = setBeamState(leftNote, leftConnectedToLeft ? 'end' : null);
      }
    } else if (isConnectedToRight) {
      // Connected only to right. Disconnect right.
      updatedNotes[noteIndex] = setBeamState(targetNote, null);
      if (noteIndex + 1 < currentNotes.length) {
        const rightNote = currentNotes[noteIndex + 1];
        const rightConnectedToRight = rightNote.beams && rightNote.beams.length > 0 && (rightNote.beams[0] === 'begin' || rightNote.beams[0] === 'continue');
        updatedNotes[noteIndex + 1] = setBeamState(rightNote, rightConnectedToRight ? 'begin' : null);
      }
    }
    
    setScore(prev => {
      const nextStaves = prev.staves.map((staff, sIdx) => {
        if (sIdx === staffIndex) {
          const nextMeasures = staff.measures.map((measure, mIdx) => {
            if (mIdx === measureIndex) {
              return {
                ...measure,
                notes: cleanInvalidBeams(updatedNotes)
              };
            }
            return measure;
          });
          return {
            ...staff,
            measures: nextMeasures
          };
        }
        return staff;
      });
      return { ...prev, staves: nextStaves };
    });
    setHasChanges(true);
  };

  const handleDeleteEditItem = () => {
    if (!selectedEditItemId) return;
    const found = findNoteInScore(score, selectedEditItemId);
    if (!found) return;
    
    const { staffIndex, measureIndex, noteIndex } = found;
    
    setScore(prev => {
      const nextStaves = prev.staves.map((staff, sIdx) => {
        if (sIdx === staffIndex) {
          const nextMeasures = staff.measures.map((measure, mIdx) => {
            if (mIdx === measureIndex) {
              const nextNotes = [...measure.notes];
              nextNotes.splice(noteIndex, 1);
              const recalculated = recalculateMeasureRests(nextNotes, prev.timeSignature);
              const cleanedNotes = cleanInvalidBeams(recalculated);
              return {
                ...measure,
                notes: cleanedNotes
              };
            }
            return measure;
          });
          return {
            ...staff,
            measures: nextMeasures
          };
        }
        return staff;
      });
      return { ...prev, staves: nextStaves };
    });
    
    setSelectedEditItemId(null);
    setSelectedPitchIndex(0);
    setHasChanges(true);
  };

  const handleModifyNote = (modIndex: number, modifications: any) => {
    const selectedMeasure = selectedMeasureIndexRef.current;
    const selectedStaff = editingStaffIndexRef.current;
    if (selectedMeasure === null || isNaN(selectedMeasure)) return;
    
    // Ensure editingStaffIndex is a valid staff index
    let staffIdx = selectedStaff;
    if (typeof staffIdx !== 'number' || isNaN(staffIdx) || staffIdx < 0 || staffIdx >= score.staves.length) {
      staffIdx = 0;
    }
    
    // Ensure selectedMeasureIndex is within bounds for this staff
    const numMeasures = score.staves[staffIdx].measures.length;
    const localMIdx = numMeasures > 0 ? selectedMeasure % numMeasures : 0;
    if (localMIdx < 0 || localMIdx >= numMeasures) {
      return;
    }

    const initialNotes = score.staves[staffIdx].measures[localMIdx].notes || [];
    
    // Break ties if pitch or isRest changes
    let activeScore = score;
    if (modifications.pitch !== undefined || modifications.isRest !== undefined) {
      // Find the index of modIndex-th user note in initialNotes
      let userCount = 0;
      let nIdx = -1;
      for (let i = 0; i < initialNotes.length; i++) {
        if (!initialNotes[i].isAutoGenerated) {
          if (userCount === modIndex) {
            nIdx = i;
            break;
          }
          userCount++;
        }
      }
      if (nIdx !== -1) {
        activeScore = breakAllTiesForNote(score, staffIdx, localMIdx, nIdx);
      }
    }

    const currentNotes = activeScore.staves[staffIdx].measures[localMIdx].notes || [];
    const userNotes = currentNotes.filter((n: any) => !n.isAutoGenerated);
    
    if (modIndex < 0 || modIndex >= userNotes.length) return;
    
    // Create a copy of the target note and apply modifications
    const targetNote = { ...userNotes[modIndex], ...modifications };
    
    // Recalculate duration if type or dot changed
    if (modifications.type !== undefined || modifications.dot !== undefined) {
      const baseDur = NOTE_TYPE_BASE_DURS[targetNote.type] || 256;
      targetNote.duration = targetNote.dot ? Math.round(baseDur * 1.5) : baseDur;
    }
    
    // Check if modifications exceed max duration
    const maxDur = getMeasureMaxDuration(activeScore.timeSignature);
    const otherUserNotes = userNotes.filter((_: any, idx: number) => idx !== modIndex);
    const otherDur = otherUserNotes.reduce((sum: number, n: any) => sum + n.duration, 0);
    
    if (otherDur + targetNote.duration > maxDur) {
      Alert.alert('Measure is already full', 'Modifying this note would exceed the time signature limit.');
      return;
    }
    
    const updatedUserNotes = [...userNotes];
    updatedUserNotes[modIndex] = targetNote;
    
    const newNotesList = recalculateMeasureRests(updatedUserNotes, activeScore.timeSignature);
    
    // Update state non-mutatingly
    setScore(prev => {
      const baseScore = activeScore;
      const nextStaves = baseScore.staves.map((staff, sIdx) => {
        if (sIdx === staffIdx) {
          const nextMeasures = staff.measures.map((measure, mIdx) => {
            if (mIdx === localMIdx) {
              return {
                ...measure,
                notes: newNotesList
              };
            }
            return measure;
          });
          return {
            ...staff,
            measures: nextMeasures
          };
        }
        return staff;
      });
      return { ...baseScore, staves: nextStaves };
    });
    
    setHasChanges(true);
  };

  const handleDeleteNote = (deleteIndex: number) => {
    const selectedMeasure = selectedMeasureIndexRef.current;
    const selectedStaff = editingStaffIndexRef.current;
    if (selectedMeasure === null || isNaN(selectedMeasure)) return;
    
    // Ensure editingStaffIndex is a valid staff index
    let staffIdx = selectedStaff;
    if (typeof staffIdx !== 'number' || isNaN(staffIdx) || staffIdx < 0 || staffIdx >= score.staves.length) {
      staffIdx = 0;
    }
    
    // Ensure selectedMeasureIndex is within bounds for this staff
    const numMeasures = score.staves[staffIdx].measures.length;
    const localMIdx = numMeasures > 0 ? selectedMeasure % numMeasures : 0;
    if (localMIdx < 0 || localMIdx >= numMeasures) {
      return;
    }

    const currentNotes = score.staves[staffIdx].measures[localMIdx].notes || [];
    const userNotes = currentNotes.filter((n: any) => !n.isAutoGenerated);
    
    if (deleteIndex < 0 || deleteIndex >= userNotes.length) return;
    
    const updatedUserNotes = userNotes.filter((_: any, idx: number) => idx !== deleteIndex);
    const newNotesList = recalculateMeasureRests(updatedUserNotes, score.timeSignature);
    
    // Update state non-mutatingly
    setScore(prev => {
      const nextStaves = prev.staves.map((staff, sIdx) => {
        if (sIdx === staffIdx) {
          const nextMeasures = staff.measures.map((measure, mIdx) => {
            if (mIdx === localMIdx) {
              return {
                ...measure,
                notes: newNotesList
              };
            }
            return measure;
          });
          return {
            ...staff,
            measures: nextMeasures
          };
        }
        return staff;
      });
      return { ...prev, staves: nextStaves };
    });
    
    setSelectedNoteIndex(null);
    setHasChanges(true);
  };

  const showPlaceholderAlert = (toolName: string) => {
    Alert.alert('Placeholder Tool', `${toolName} editing is a placeholder and will be implemented in future editor updates.`);
  };
  
  if (editorMode === 'choice') {
    return (
      <View style={styles.container}>
        <View style={styles.choiceHeader}>
          <Text style={styles.choiceTitle}>Create Music Sheet</Text>
          <Text style={styles.choiceSubtitle}>Start transcribing or compose from scratch</Text>
        </View>

        <View style={styles.cardContainer}>
          
          <Pressable
            onPress={() => {
              setScore({
                title: {
                  text: 'Untitled Score',
                  fontFamily: 'Default',
                  fontSize: 28,
                  bold: true,
                  italic: false,
                },
                author: {
                  text: 'Unknown Author',
                  fontFamily: 'Default',
                  fontSize: 16,
                  bold: false,
                  italic: true,
                },
                tempo: 120,
                keySignature: 'C Major',
                timeSignature: '4/4',
                staves: [
                  {
                    id: '1',
                    clef: 'treble',
                    measures: getInitialMeasures(4, '4/4'),
                  },
                  {
                    id: '2',
                    clef: 'bass',
                    measures: getInitialMeasures(4, '4/4'),
                  },
                ],
              });
              setIsPlaying(false);
              setCurrentTime(0);
              setDuration(0);
              setSelectedTextElement(null);
              setSelectedStaffIndex(null);
              setSelectedMeasureIndex(null);
              setEditorMode('scratch');
            }}
            style={({ pressed }) => [
              styles.choiceCard,
              { opacity: pressed ? 0.9 : 1, borderColor: '#ff9500' },
            ]}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#fff2e0' }]}>
              <Ionicons name="document-text-outline" size={32} color="#ff9500" />
            </View>
            <View style={styles.cardContent}>
              <View style={styles.badgeRow}>
                <Text style={styles.cardTitle}>Create Music Sheet From Scratch</Text>
                <View style={[styles.badge, { backgroundColor: '#fff2e0' }]}>
                  <Text style={[styles.badgeText, { color: '#b26a00' }]}>Compose</Text>
                </View>
              </View>
              <Text style={styles.cardSubtitle}>
                Open a blank music sheet document and construct voices, parts, and staves manually.
              </Text>
            </View>
          </Pressable>
        </View>
      </View>
    );
  }

  console.log("editorMode =", editorMode);
  return (
    <View style={styles.editorMainContainer}>
      {/* Top Header/Navbar */}
      <View style={styles.navbar}>
        <View style={{ width: 70, height: 40, justifyContent: 'center', position: 'relative' }}>
          <Animated.View
            pointerEvents={isEditMode ? 'none' : 'auto'}
            style={{
              position: 'absolute',
              left: 0,
              opacity: backOpacity,
              transform: [{ scale: backScale }],
            }}
          >
            <Pressable
              onPress={handleExit}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color="#ff9500" />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          </Animated.View>

          <Animated.View
            pointerEvents={isEditMode ? 'auto' : 'none'}
            style={{
              position: 'absolute',
              left: 0,
              opacity: exitOpacity,
              transform: [{ scale: exitScale }],
            }}
          >
            <Pressable
              onPress={handleExitEditMode}
              style={styles.backButton}
            >
              <Ionicons name="close" size={24} color="#ff9500" />
              <Text style={styles.backText}>Exit</Text>
            </Pressable>
          </Animated.View>
        </View>
        <Text style={styles.navbarTitle} numberOfLines={1}>
          {score.title.text}
        </Text>
        {isEditMode ? (
          <Pressable
            onPress={handleSaveProject}
            style={{ width: 60, alignItems: 'flex-end', justifyContent: 'center' }}
          >
            <Text style={{ color: '#ff9500', fontSize: 16, fontWeight: '600' }}>Save</Text>
          </Pressable>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      <View style={styles.editorWorkspace}>
        {/* Left Toolbar/Control Sidebar */}
        {!sidebarCollapsed && isEditMode && (
          <View style={styles.sidebar}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sidebarScroll}
          >
            <Text style={styles.sidebarHeader}>Metadata</Text>
            
            {/* Tempo Input */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Tempo (BPM)</Text>
              <TextInput
                keyboardType="numeric"
                value={tempoInputText}
                onChangeText={(text) => {
                  setTempoInputText(text);
                }}
                onEndEditing={() => {
                  let val = parseInt(tempoInputText) || 120;
                  if (val > 300) {
                    val = 300;
                  } else if (val < 30) {
                    val = 30;
                  }
                  setTempoInputText(val.toString());
                  setScore(prev => ({ ...prev, tempo: val }));
                  setIsPlaying(false);
                  setCurrentTime(0);
                  postMessageToSheet({ type: 'PAUSE' });
                  postMessageToSheet({ type: 'SEEK', time: 0 });
                  setHasChanges(true);
                }}
                style={styles.textInput}
                placeholder="120"
                placeholderTextColor="#666"
              />
            </View>

            {/* Key Signature Picker Trigger */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Key Signature</Text>
              <Pressable
                onPress={() => setShowKeyPicker(true)}
                style={styles.pickerSelector}
              >
                <Text style={styles.pickerSelectorText}>{score.keySignature}</Text>
                <Ionicons name="chevron-down-outline" size={16} color="#aaa" />
              </Pressable>
            </View>

            {/* Time Signature Picker Trigger */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Time Signature</Text>
              <Pressable
                onPress={() => setShowTimePicker(true)}
                style={styles.pickerSelector}
              >
                <Text style={styles.pickerSelectorText}>{score.timeSignature}</Text>
                <Ionicons name="chevron-down-outline" size={16} color="#aaa" />
              </Pressable>
            </View>

            <View style={styles.divider} />
            <Text style={styles.sidebarHeader}>Zoom Controls</Text>
            
            <Pressable onPress={handleZoomIn} style={styles.actionButton}>
              <Ionicons name="add-outline" size={18} color="white" />
              <Text style={styles.actionButtonText}>Zoom In (+)</Text>
            </Pressable>
            <Pressable onPress={handleZoomOut} style={[styles.actionButton, { marginTop: 8 }]}>
              <Ionicons name="remove-outline" size={18} color="white" />
              <Text style={styles.actionButtonText}>Zoom Out (-)</Text>
            </Pressable>
            <Pressable onPress={handleResetZoom} style={[styles.actionButton, { backgroundColor: '#3a3a3c', marginTop: 8 }]}>
              <Ionicons name="refresh-outline" size={18} color="white" />
              <Text style={styles.actionButtonText}>Reset Zoom</Text>
            </Pressable>

            <View style={styles.divider} />
            <Text style={styles.sidebarHeader}>Staff Controls</Text>

            {/* Add/Remove Staff */}
            <Pressable
              onPress={handleAddStaffDirectly}
              style={styles.actionButton}
            >
              <Ionicons name="add-circle-outline" size={18} color="white" />
              <Text style={styles.actionButtonText}>Add Staff</Text>
            </Pressable>

            <Pressable
              onPress={handleRemoveStaff}
              style={[styles.actionButton, { backgroundColor: '#3a3a3c', marginTop: 8 }]}
            >
              <Ionicons name="trash-outline" size={18} color="white" />
              <Text style={styles.actionButtonText}>Remove Staff</Text>
            </Pressable>

            {(selectedStaffIndex !== null || selectedStaffIndices.length > 0) && (
              <>
                <Pressable
                  onPress={handleDeleteSelectedStaves}
                  style={[styles.actionButton, { backgroundColor: '#8b5cf6', marginTop: 8 }]}
                >
                  <Ionicons name="trash-outline" size={18} color="white" />
                  <Text style={styles.actionButtonText}>Delete Selected Staff</Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowStaffClefModal(true)}
                  style={[styles.actionButton, { backgroundColor: '#8b5cf6', marginTop: 8 }]}
                >
                  <Ionicons name="musical-notes-outline" size={18} color="white" />
                  <Text style={styles.actionButtonText}>Change Clef</Text>
                </Pressable>
              </>
            )}

            <View style={styles.divider} />
            <Text style={styles.sidebarHeader}>Measure Controls</Text>
            
            <Pressable onPress={() => handleAddMeasure('append')} style={styles.actionButton}>
              <Ionicons name="add-circle-outline" size={18} color="white" />
              <Text style={styles.actionButtonText}>Append Measure</Text>
            </Pressable>

            {selectedMeasureIndex !== null && (
              <>
                <Text style={[styles.sidebarHeader, { marginTop: 14 }]}>Selected Bar</Text>
                <Pressable onPress={() => handleAddMeasure('before')} style={styles.actionButton}>
                  <Ionicons name="arrow-back-outline" size={18} color="white" />
                  <Text style={styles.actionButtonText}>Insert Before</Text>
                </Pressable>
                <Pressable onPress={() => handleAddMeasure('after')} style={[styles.actionButton, { marginTop: 8 }]}>
                  <Ionicons name="arrow-forward-outline" size={18} color="white" />
                  <Text style={styles.actionButtonText}>Insert After</Text>
                </Pressable>
                <Pressable onPress={handleDeleteMeasure} style={[styles.actionButton, { backgroundColor: '#ba1a1a', marginTop: 8 }]}>
                  <Ionicons name="trash-outline" size={18} color="white" />
                  <Text style={styles.actionButtonText}>Delete Bar</Text>
                </Pressable>
                <Pressable
                  onPress={() => setSwapMode(!swapMode)}
                  style={[
                    styles.actionButton,
                    { backgroundColor: swapMode ? '#ff9500' : '#8b5cf6', marginTop: 8 }
                  ]}
                >
                  <Ionicons name="swap-horizontal-outline" size={18} color="white" />
                  <Text style={styles.actionButtonText}>
                    {swapMode ? 'Select Target Bar...' : 'Swap Bar'}
                  </Text>
                </Pressable>
              </>
            )}

            <View style={styles.divider} />
            <Text style={styles.sidebarHeader}>Edit Tools</Text>

            {/* Placeholder Controls */}
            {[
              { label: '+ Add Note', icon: 'musical-note-outline' },
              { label: 'Delete Note', icon: 'cut-outline' },
              { label: 'Treble Clef', icon: 'git-commit-outline' },
              { label: 'Bass Clef', icon: 'git-commit-outline' },
              { label: 'Time Signature', icon: 'time-outline' },
              { label: 'Key Signature', icon: 'key-outline' },
              { label: 'Tempo', icon: 'speedometer-outline' },
            ].map((tool, idx) => (
              <Pressable
                key={idx}
                onPress={() => showPlaceholderAlert(tool.label)}
                style={styles.placeholderButton}
              >
                <Ionicons name={tool.icon as any} size={16} color="#888" />
                <Text style={styles.placeholderButtonText}>{tool.label}</Text>
              </Pressable>
            ))}


          </ScrollView>
        </View>
        )}

        {/* Sidebar Collapse Toggle Button */}
        {isEditMode && (
          <Pressable
            onPress={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={[
              styles.collapseToggle,
              sidebarCollapsed ? styles.collapseToggleCollapsed : styles.collapseToggleExpanded
            ]}
          >
            <Ionicons
              name={sidebarCollapsed ? "chevron-forward" : "chevron-back"}
              size={18}
              color="#ffffff"
            />
          </Pressable>
        )}

        {/* Main Music Sheet Rendering Area */}
        <View style={[styles.mainSheetArea, !isEditMode && { backgroundColor: '#18181b' }]}>
          <ScrollView
            ref={scrollViewRef}
            nestedScrollEnabled
            scrollEnabled={!isWebViewEditModeActive && !showNoteSelectionModal}
            onScroll={(e) => {
              setScrollY(e.nativeEvent.contentOffset.y);
            }}
            onLayout={(e) => {
              setScrollViewHeight(e.nativeEvent.layout.height);
            }}
            scrollEventThrottle={16}
            contentContainerStyle={styles.sheetContainer}
            style={styles.sheetScrollView}
          >
            <View style={styles.documentCard}>
              <View style={styles.documentHeader}>
                {/* Orange Edit Button in View Mode */}
                {!isEditMode && (
                  <Pressable
                    onPress={() => {
                      setIsEditMode(true);
                      postMessageToSheet({ type: 'SET_EDIT_MODE', editable: true });
                    }}
                    style={({ pressed }) => [
                      {
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        backgroundColor: '#ea580c',
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        borderRadius: 8,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.2,
                        shadowRadius: 4,
                        elevation: 3,
                        zIndex: 99,
                      },
                      pressed && { opacity: 0.8 }
                    ]}
                  >
                    <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>Edit</Text>
                  </Pressable>
                )}
                <View
                  {...(isEditMode ? titlePanResponder.panHandlers : {})}
                  style={{
                    transform: [
                      { translateX: score.title.x || 0 },
                      { translateY: score.title.y || 0 }
                    ],
                    alignItems: 'center',
                    width: '100%',
                    zIndex: 10,
                  }}
                >
                  {selectedTextElement === 'title' && isEditMode ? (
                    <View style={{ alignItems: 'center', width: '100%', marginBottom: 12 }}>
                      <FloatingTextToolbar element="title" />
                      <TextInput
                        ref={titleInputRef}
                        value={score.title.text}
                        onChangeText={(text) => {
                          setScore(prev => ({ ...prev, title: { ...prev.title, text } }));
                          setHasChanges(true);
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            if (!isInteractingWithToolbar.current) {
                              setSelectedTextElement(null);
                            }
                            isInteractingWithToolbar.current = false;
                          }, 150);
                        }}
                        autoFocus
                        style={[
                          styles.docTitle,
                          {
                            fontFamily: getFontFamily(score.title.fontFamily),
                            fontSize: score.title.fontSize,
                            fontWeight: score.title.bold ? 'bold' : 'normal',
                            fontStyle: score.title.italic ? 'italic' : 'normal',
                            borderBottomWidth: 1,
                            borderBottomColor: '#ff9500',
                            minWidth: 240,
                            textAlign: 'center',
                            paddingVertical: 2,
                          },
                        ]}
                      />
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => {
                        if (!isEditMode) return;
                        setSelectedTextElement('title');
                        setSelectedStaffIndex(null);
                        setSelectedMeasureIndex(null);
                        setSelectedBarId(null);
                      }}
                      style={[
                        styles.editableTextContainer,
                        isEditMode && styles.editableTextContainerHoverable,
                      ]}
                    >
                      <Text
                        style={[
                          styles.docTitle,
                          {
                            fontFamily: getFontFamily(score.title.fontFamily),
                            fontSize: score.title.fontSize,
                            fontWeight: score.title.bold ? 'bold' : 'normal',
                            fontStyle: score.title.italic ? 'italic' : 'normal',
                          },
                        ]}
                      >
                        {score.title.text || 'Untitled Score'}
                      </Text>
                    </Pressable>
                  )}
                </View>

                <View
                  {...(isEditMode ? authorPanResponder.panHandlers : {})}
                  style={{
                    transform: [
                      { translateX: score.author.x || 0 },
                      { translateY: score.author.y || 0 }
                    ],
                    alignItems: 'center',
                    width: '100%',
                    zIndex: 9,
                  }}
                >
                  {selectedTextElement === 'author' && isEditMode ? (
                    <View style={{ alignItems: 'center', width: '100%', marginTop: 8 }}>
                      <FloatingTextToolbar element="author" />
                      <TextInput
                        ref={authorInputRef}
                        value={score.author.text}
                        onChangeText={(text) => {
                          setScore(prev => ({ ...prev, author: { ...prev.author, text } }));
                          setHasChanges(true);
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            if (!isInteractingWithToolbar.current) {
                              setSelectedTextElement(null);
                            }
                            isInteractingWithToolbar.current = false;
                          }, 150);
                        }}
                        autoFocus
                        style={[
                          styles.docAuthor,
                          {
                            fontFamily: getFontFamily(score.author.fontFamily),
                            fontSize: score.author.fontSize,
                            fontWeight: score.author.bold ? 'bold' : 'normal',
                            fontStyle: score.author.italic ? 'italic' : 'normal',
                            borderBottomWidth: 1,
                            borderBottomColor: '#ff9500',
                            minWidth: 180,
                            textAlign: 'center',
                            paddingVertical: 2,
                          },
                        ]}
                      />
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => {
                        if (!isEditMode) return;
                        setSelectedTextElement('author');
                        setSelectedStaffIndex(null);
                        setSelectedMeasureIndex(null);
                        setSelectedBarId(null);
                      }}
                      style={[
                        styles.editableTextContainer,
                        isEditMode && styles.editableTextContainerHoverable,
                      ]}
                    >
                      <Text
                        style={[
                          styles.docAuthor,
                          {
                            fontFamily: getFontFamily(score.author.fontFamily),
                            fontSize: score.author.fontSize,
                            fontWeight: score.author.bold ? 'bold' : 'normal',
                            fontStyle: score.author.italic ? 'italic' : 'normal',
                          },
                        ]}
                      >
                        {score.author.text || 'Unknown Author'}
                      </Text>
                    </Pressable>
                  )}
                </View>

                <View style={styles.docMetaRow}>
                  <Pressable
                    onPress={() => {
                      if (!isEditMode) return;
                      setShowKeyPicker(true);
                    }}
                    style={({ pressed }) => [
                      styles.metaClickable,
                      pressed && isEditMode && styles.metaClickablePressed
                    ]}
                  >
                    <Text style={styles.docMetaText}>Key: {score.keySignature || 'C Major'}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (!isEditMode) return;
                      setShowTimePicker(true);
                    }}
                    style={({ pressed }) => [
                      styles.metaClickable,
                      pressed && isEditMode && styles.metaClickablePressed
                    ]}
                  >
                    <Text style={styles.docMetaText}>Time: {score.timeSignature || '4/4'}</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.webViewWrapper} pointerEvents={showNoteSelectionModal ? 'none' : 'auto'}>
                {(() => {
                  try {
                    console.log('[DEBUG] Score exists:', !!score);
                    console.log('[DEBUG] Staves:', score?.staves?.length);
                    console.log('[DEBUG] First Staff:', score?.staves?.[0]);
                    console.log('[DEBUG] Measures:', score?.staves?.[0]?.measures?.length);

                    console.log("=== CREATE PAGE USING SHEETMUSIC ===");
                    console.log("CREATE -> rendering SheetMusic");
                    return (
                      <SheetMusic
                        key="scratch-editor-music-sheet"
                        webViewRef={webViewRef}
                        onMessage={handleMessage}
                        notes={dummyNotes}
                        timeSignature={score.timeSignature}
                        detectedTempo={score.tempo}
                        musicxml={scoreMusicXML}
                        hideHeader={true}
                        hideFooter={true}
                        borderless={true}
                        id={sheetMusicId || "scratch-editor-music-sheet"}
                        score={score}
                        staves={score.staves}
                        selectedNoteId={selectedNoteId || undefined}
                        selectedNoteIds={selectedNoteIds}
                        selectedMeasureIndex={selectedMeasureIndex}
                        selectedBarId={selectedBarId}
                        editable={isEditMode}
                        measuresPerSystem={measuresPerSystem}
                      />
                    );
                  } catch (err: any) {
                    console.error('[SHEET] Error loading sheet music:', err);
                    return (
                      <View style={{ padding: 24, backgroundColor: '#fee2e2', borderRadius: 12, borderWidth: 1, borderColor: '#f87171', alignItems: 'center' }}>
                        <Ionicons name="alert-circle-outline" size={48} color="#dc2626" />
                        <Text style={{ color: '#991b1b', fontSize: 18, fontWeight: '700', marginTop: 12 }}>Sheet Music Load Error</Text>
                        <Text style={{ color: '#7f1d1d', fontSize: 14, marginTop: 4, textAlign: 'center' }}>{err?.message || 'Unknown error occurred while generating sheet music.'}</Text>
                      </View>
                    );
                  }
                })()}
              </View>
            </View>
          </ScrollView>

          {/* Playback Mode Selector (Transcribed Projects Only, Read Mode Only) */}
          {initialSourceType === 'transcribed' && !isEditMode && recordingURI !== '' && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 8, backgroundColor: '#000000', paddingVertical: 4 }}>
              <View style={{ flexDirection: 'row', backgroundColor: '#1c1c1e', borderRadius: 20, padding: 3, gap: 4 }}>
                <Pressable
                  onPress={() => {
                    if (playbackMode === 'notation') return;
                    if (isPlaying) {
                      player.pause();
                    }
                    setPlaybackMode('notation');
                    setIsPlaying(false);
                    setCurrentTime(0);
                    playerCurrentTimeRef.current = 0;
                    postMessageToSheet({ type: 'SEEK', time: 0 });
                  }}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 16,
                    borderRadius: 17,
                    backgroundColor: playbackMode === 'notation' ? '#ff9500' : 'transparent',
                  }}
                >
                  <Text style={{ color: 'white', fontSize: 13, fontWeight: '700' }}>
                    Sheet Synth
                  </Text>
                </Pressable>
                
                <Pressable
                  onPress={() => {
                    if (playbackMode === 'original') return;
                    if (isPlaying) {
                      postMessageToSheet({ type: 'PAUSE' });
                    }
                    setPlaybackMode('original');
                    setIsPlaying(false);
                    setCurrentTime(0);
                    playerCurrentTimeRef.current = 0;
                    player.seekTo(0);
                    if (player.duration) {
                      setDuration(player.duration);
                    }
                  }}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 16,
                    borderRadius: 17,
                    backgroundColor: playbackMode === 'original' ? '#ff9500' : 'transparent',
                  }}
                >
                  <Text style={{ color: 'white', fontSize: 13, fontWeight: '700' }}>
                    Original Audio
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Playback Controls Panel */}
          <PlaybackController
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            onPlayPause={playRecording}
            onRestart={restartPlayback}
            onSeek={handleSeek}
            onDragStart={handleDragStart}
            renderRightSide={() => (
              <Text style={{ color: '#8e8e93', fontSize: 13, fontWeight: '600' }}>
                ♩ = {score.tempo}
              </Text>
            )}
          />

          {selectedStaffIndices.length > 0 && (
            <View style={styles.floatingActionBar}>
              <Text style={styles.floatingActionText}>
                {selectedStaffIndices.length} Staff{selectedStaffIndices.length > 1 ? 's' : ''} Selected
              </Text>
              <View style={styles.floatingActionButtons}>
                <Pressable
                  onPress={handleDeleteSelectedStaves}
                  style={[styles.floatingButton, { backgroundColor: '#ef4444' }]}
                >
                  <Ionicons name="trash-outline" size={16} color="white" />
                  <Text style={styles.floatingButtonText}>Delete Staff</Text>
                </Pressable>
                <Pressable
                  onPress={handleClearSelectedStaves}
                  style={[styles.floatingButton, { backgroundColor: '#ff9500' }]}
                >
                  <Ionicons name="sparkles-outline" size={16} color="white" />
                  <Text style={styles.floatingButtonText}>Clear Staff</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setSelectedStaffIndices([]);
                    setSelectedStaffIndex(null);
                    postMessageToSheet({ type: 'CLEAR_SELECTION' });
                  }}
                  style={[styles.floatingButton, { backgroundColor: '#3a3a3c' }]}
                >
                  <Ionicons name="close-outline" size={16} color="white" />
                  <Text style={styles.floatingButtonText}>Deselect</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Floating Pitch Control Widget for Selected Note */}
      {(() => {
        if (!selectedNoteId) return null;
        const found = findNoteInScore(score, selectedNoteId);
        if (!found || found.note.isRest) return null;
        const notePitch = found.note.pitch || 'C4';
        
        return (
          <View style={styles.floatingPitchContainer}>
            <View style={styles.floatingPitchHeader}>
              <Text style={styles.floatingPitchTitle}>
                {selectedNoteIds.length === 2 ? '2 Notes Selected' : `Pitch: ${notePitch}`}
              </Text>
            </View>
            <View style={styles.floatingPitchRow}>
              {selectedNoteIds.length === 2 ? (
                <>
                  {isTied(score, selectedNoteIds[0], selectedNoteIds[1]) ? (
                    <Pressable
                      onPress={handleRemoveTie}
                      style={({ pressed }) => [
                        styles.floatingPitchButton,
                        { backgroundColor: '#ff453a' },
                        pressed && { opacity: 0.7 }
                      ]}
                    >
                      <Ionicons name="link-outline" size={18} color="white" />
                      <Text style={styles.floatingPitchBtnText}>Remove Tie</Text>
                    </Pressable>
                  ) : isTieValid(score, selectedNoteIds[0], selectedNoteIds[1]) ? (
                    <Pressable
                      onPress={handleCreateTie}
                      style={({ pressed }) => [
                        styles.floatingPitchButton,
                        { backgroundColor: '#34c759' },
                        pressed && { opacity: 0.7 }
                      ]}
                    >
                      <Ionicons name="link" size={18} color="white" />
                      <Text style={styles.floatingPitchBtnText}>Tie Notes</Text>
                    </Pressable>
                  ) : null}

                  {isBeamConnectionValid(score, selectedNoteIds[0], selectedNoteIds[1]) ? (
                    areNotesConnected(score, selectedNoteIds[0], selectedNoteIds[1]) ? (
                      <Pressable
                        onPress={() => handleDisconnectTwoNotes(selectedNoteIds[0], selectedNoteIds[1])}
                        style={({ pressed }) => [
                          styles.floatingPitchButton,
                          { backgroundColor: '#ff453a' },
                          pressed && { opacity: 0.7 }
                        ]}
                      >
                        <Ionicons name="git-commit-outline" size={18} color="white" />
                        <Text style={styles.floatingPitchBtnText}>Disconnect Notes</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => handleConnectTwoNotes(selectedNoteIds[0], selectedNoteIds[1])}
                        style={({ pressed }) => [
                          styles.floatingPitchButton,
                          { backgroundColor: '#34c759' },
                          pressed && { opacity: 0.7 }
                        ]}
                      >
                        <Ionicons name="git-commit" size={18} color="white" />
                        <Text style={styles.floatingPitchBtnText}>Connect Notes</Text>
                      </Pressable>
                    )
                  ) : null}
                </>
              ) : (
                <>
                  <Pressable
                    onPress={() => handleMoveNoteDirectly(selectedNoteId, 'up')}
                    style={({ pressed }) => [
                      styles.floatingPitchButton,
                      pressed && { opacity: 0.7 }
                    ]}
                  >
                    <Ionicons name="arrow-up" size={18} color="white" />
                    <Text style={styles.floatingPitchBtnText}>Pitch Up</Text>
                  </Pressable>
                  
                  <Pressable
                    onPress={() => handleMoveNoteDirectly(selectedNoteId, 'down')}
                    style={({ pressed }) => [
                      styles.floatingPitchButton,
                      pressed && { opacity: 0.7 }
                    ]}
                  >
                    <Ionicons name="arrow-down" size={18} color="white" />
                    <Text style={styles.floatingPitchBtnText}>Pitch Down</Text>
                  </Pressable>
                </>
              )}

              <Pressable
                onPress={() => {
                  setSelectedNoteId(null);
                  setSelectedNoteIds([]);
                  postMessageToSheet({ type: 'CLEAR_SELECTION' });
                }}
                style={({ pressed }) => [
                  styles.floatingPitchButton,
                  { backgroundColor: '#3a3a3c', width: 40, flex: 0 },
                  pressed && { opacity: 0.7 }
                ]}
              >
                <Ionicons name="close" size={18} color="white" />
              </Pressable>
            </View>
          </View>
        );
      })()}

      {/* Pickers Custom Overlays */}
      
      {/* Key Signature Modal Picker */}
      <Modal visible={showKeyPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Key Signature</Text>
              <Pressable onPress={() => setShowKeyPicker(false)}>
                <Text style={styles.modalClose}>Done</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll}>
              {Object.keys(KEY_SIGNATURES).map((key) => (
                <Pressable
                  key={key}
                  onPress={() => {
                    setScore(prev => ({ ...prev, keySignature: key }));
                    setShowKeyPicker(false);
                    setHasChanges(true);
                  }}
                  style={styles.modalItem}
                >
                  <Text style={[
                    styles.modalItemText,
                    score.keySignature === key && { color: '#ff9500', fontWeight: 'bold' }
                  ]}>
                    {key}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Time Signature Modal Picker */}
      <Modal visible={showTimePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Time Signature</Text>
              <Pressable onPress={() => setShowTimePicker(false)}>
                <Text style={styles.modalClose}>Done</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll}>
              {TIME_SIGNATURES.map((sig) => (
                <Pressable
                  key={sig}
                  onPress={() => {
                    setScore(prev => {
                      const [beatsStr, beatTypeStr] = sig.split('/');
                      const beats = parseInt(beatsStr) || 4;
                      const beatType = parseInt(beatTypeStr) || 4;
                      const maxDur = getMeasureMaxDuration(sig);
                      const originalNumMeasures = prev.staves[0]?.measures.length || 0;

                      // 1. Reflow notes for each staff
                      const staffReflowedNotes: any[][] = [];
                      prev.staves.forEach((staff) => {
                        const allUserNotes: any[] = [];
                        staff.measures.forEach((measure) => {
                          const userNotesInMeasure = (measure.notes || []).filter((n: any) => !n.isAutoGenerated);
                          userNotesInMeasure.forEach((n: any) => {
                            const clonedNote = { ...n };
                            if (clonedNote.duration > maxDur) {
                              clonedNote.duration = maxDur;
                              if (clonedNote.duration >= 1024) {
                                clonedNote.type = 'whole';
                                clonedNote.dot = false;
                              } else if (clonedNote.duration >= 768) {
                                clonedNote.type = 'half';
                                clonedNote.dot = true;
                              } else if (clonedNote.duration >= 512) {
                                clonedNote.type = 'half';
                                clonedNote.dot = false;
                              } else if (clonedNote.duration >= 384) {
                                clonedNote.type = 'quarter';
                                clonedNote.dot = true;
                              } else if (clonedNote.duration >= 256) {
                                clonedNote.type = 'quarter';
                                clonedNote.dot = false;
                              } else if (clonedNote.duration >= 192) {
                                clonedNote.type = 'eighth';
                                clonedNote.dot = true;
                              } else if (clonedNote.duration >= 128) {
                                clonedNote.type = 'eighth';
                                clonedNote.dot = false;
                              } else {
                                clonedNote.type = '16th';
                                clonedNote.dot = false;
                              }
                            }
                            allUserNotes.push(clonedNote);
                          });
                        });

                        const measuresNotes: any[][] = [];
                        let currentMeasureNotes: any[] = [];
                        let currentMeasureDur = 0;

                        allUserNotes.forEach((note) => {
                          if (currentMeasureDur + note.duration <= maxDur) {
                            currentMeasureNotes.push(note);
                            currentMeasureDur += note.duration;
                          } else {
                            const remaining = maxDur - currentMeasureDur;
                            if (remaining > 0) {
                              currentMeasureNotes.push(...getFillerRests(remaining));
                            }
                            measuresNotes.push(currentMeasureNotes);

                            currentMeasureNotes = [note];
                            currentMeasureDur = note.duration;
                          }
                        });

                        if (currentMeasureNotes.length > 0 || measuresNotes.length === 0) {
                          const remaining = maxDur - currentMeasureDur;
                          if (remaining > 0) {
                            currentMeasureNotes.push(...getFillerRests(remaining));
                          }
                          measuresNotes.push(currentMeasureNotes);
                        }

                        staffReflowedNotes.push(measuresNotes);
                      });

                      // 2. Find max required measures
                      let finalNumMeasures = originalNumMeasures;
                      staffReflowedNotes.forEach((measuresNotes) => {
                        if (measuresNotes.length > finalNumMeasures) {
                          finalNumMeasures = measuresNotes.length;
                        }
                      });

                      // 3. Build new staves
                      const nextStaves = prev.staves.map((staff, sIdx) => {
                        const reflowed = staffReflowedNotes[sIdx];
                        const nextMeasures = [];

                        for (let m = 0; m < finalNumMeasures; m++) {
                          let notes = [];
                          if (m < reflowed.length) {
                            notes = reflowed[m];
                          } else {
                            notes = getFillerRests(maxDur);
                          }

                          const measureId = staff.measures[m]?.id || 'm_' + Math.random().toString(36).substr(2, 9);
                          nextMeasures.push({
                            id: measureId,
                            notes: notes
                          });
                        }

                        return {
                          ...staff,
                          measures: nextMeasures
                        };
                      });

                      return {
                        ...prev,
                        timeSignature: sig,
                        staves: nextStaves
                      };
                    });
                    setShowTimePicker(false);
                    setHasChanges(true);
                  }}
                  style={styles.modalItem}
                >
                  <Text style={[
                    styles.modalItemText,
                    score.timeSignature === sig && { color: '#ff9500', fontWeight: 'bold' }
                  ]}>
                    {sig}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Clef Modal Picker (for adding staves) */}
      <Modal visible={showClefPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: 280 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Staff Clef</Text>
              <Pressable onPress={() => setShowClefPicker(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </Pressable>
            </View>
            <View style={{ padding: 12 }}>
              {(['treble', 'bass', 'alto', 'tenor'] as const).map((clef) => (
                <Pressable
                  key={clef}
                  onPress={() => handleAddStaff(clef)}
                  style={styles.modalItem}
                >
                  <Text style={[styles.modalItemText, { textTransform: 'capitalize' }]}>
                    {clef} Clef
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Staff Clef Modal */}
      <Modal visible={showStaffClefModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: 280 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Staff Clef</Text>
              <Pressable onPress={() => setShowStaffClefModal(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </Pressable>
            </View>
            <View style={{ padding: 12 }}>
              {(['treble', 'bass', 'alto', 'tenor'] as const).map((clef) => (
                <Pressable
                  key={clef}
                  onPress={() => handleChangeStaffClef(clef)}
                  style={styles.modalItem}
                >
                  <Text style={[styles.modalItemText, { textTransform: 'capitalize' }]}>
                    {clef} Clef
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Unsaved Changes Modal */}
      <Modal visible={showUnsavedModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { padding: 24, alignItems: 'center' }]}>
            <Ionicons name="warning-outline" size={48} color="#ff9500" style={{ marginBottom: 16 }} />
            <Text style={[styles.modalTitle, { fontSize: 20, marginBottom: 8 }]}>Unsaved Changes</Text>
            <Text style={{ color: '#8e8e93', fontSize: 15, textAlign: 'center', marginBottom: 24, lineHeight: 22 }}>
              You have unsaved changes.{"\n"}Would you like to save before exiting edit mode?
            </Text>
            <View style={{ width: '100%', gap: 12 }}>
              <Pressable
                onPress={handleSaveEditMode}
                style={[styles.actionButton, { width: '100%', paddingVertical: 12 }]}
              >
                <Text style={styles.actionButtonText}>Save</Text>
              </Pressable>
              <Pressable
                onPress={handleDiscardEditMode}
                style={[styles.actionButton, { width: '100%', paddingVertical: 12, backgroundColor: '#ba1a1a' }]}
              >
                <Text style={styles.actionButtonText}>Don't Save</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowUnsavedModal(false)}
                style={[styles.actionButton, { width: '100%', paddingVertical: 12, backgroundColor: '#3a3a3c' }]}
              >
                <Text style={styles.actionButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Note Selection Modal */}
      {/* Note Selection Modal */}
      <Modal visible={showNoteSelectionModal} transparent animationType="fade" onRequestClose={closeNoteSelectionModal}>
        <View style={styles.popupModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeNoteSelectionModal} />
          <View style={styles.popupModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Bar</Text>
            </View>

            {/* Top: Selected bar preview */}
            {modalPreviewSvg ? (
              <View style={{ height: 130, width: '100%', backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#2c2c2e', overflow: 'hidden' }}>
                {Platform.OS === 'web' ? (
                  <iframe
                    srcDoc={`
                      <!DOCTYPE html>
                      <html>
                        <head>
                          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
                          <style>
                            body, html {
                              margin: 0;
                              padding: 0;
                              width: 100%;
                              height: 100%;
                              overflow: auto;
                              background-color: white;
                              color: #18181b;
                              display: flex;
                              align-items: center;
                              justify-content: center;
                              position: relative;
                              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                              -webkit-overflow-scrolling: touch;
                            }
                            svg {
                              position: absolute;
                              top: 0;
                              left: 0;
                              width: 100%;
                              height: 100%;
                              display: block;
                              transition: width 0.2s ease, height 0.2s ease;
                            }
                            .selected-edit-item * {
                              fill: #8b5cf6 !important;
                              stroke: #8b5cf6 !important;
                              color: #8b5cf6 !important;
                            }
                            .note, .rest {
                              cursor: pointer !important;
                              pointer-events: all !important;
                            }
                            #zoom-controls {
                              position: fixed;
                              top: 8px;
                              right: 8px;
                              display: flex;
                              background: rgba(255, 255, 255, 0.95);
                              border: 1px solid #d1d1d6;
                              border-radius: 6px;
                              z-index: 1000;
                              box-shadow: 0 1px 3px rgba(0,0,0,0.15);
                              overflow: hidden;
                            }
                            #zoom-controls button {
                              background: transparent;
                              border: none;
                              padding: 6px 12px;
                              font-size: 14px;
                              font-weight: 600;
                              color: #333;
                              cursor: pointer;
                              outline: none;
                              user-select: none;
                              display: flex;
                              align-items: center;
                              justify-content: center;
                            }
                            #zoom-controls button:active {
                              background-color: #e5e5ea;
                            }
                            #zoom-controls button:not(:last-child) {
                              border-right: 1px solid #d1d1d6;
                            }
                          </style>
                        </head>
                        <body>
                          <div id="popup-preview" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: white; box-sizing: border-box; overflow: hidden; position: relative;">
                            ${modalPreviewSvg}
                          </div>
                          <div id="zoom-controls">
                            <button id="zoom-out" title="Zoom Out">−</button>
                            <button id="zoom-reset" title="Reset Zoom">100%</button>
                            <button id="zoom-in" title="Zoom In">+</button>
                          </div>
                          <script>
                            let zoomLevel = 1.0;
                            
                            function updateZoom() {
                              const svgEl = document.querySelector('svg');
                              if (svgEl) {
                                const sizeStr = (100 * zoomLevel) + '%';
                                svgEl.style.width = sizeStr;
                                svgEl.style.height = sizeStr;
                                svgEl.style.minWidth = sizeStr;
                                svgEl.style.minHeight = sizeStr;
                                svgEl.style.maxHeight = sizeStr;
                                
                                if (zoomLevel > 1.0) {
                                  document.body.style.justifyContent = 'flex-start';
                                  document.body.style.alignItems = 'flex-start';
                                } else {
                                  document.body.style.justifyContent = 'center';
                                  document.body.style.alignItems = 'center';
                                }
                                
                                document.getElementById('zoom-reset').innerText = Math.round(zoomLevel * 100) + '%';
                              }
                            }
                            
                            document.getElementById('zoom-in').addEventListener('click', function(e) {
                              e.preventDefault();
                              e.stopPropagation();
                              if (zoomLevel < 3.0) {
                                zoomLevel += 0.25;
                                updateZoom();
                              }
                            });
                            
                            document.getElementById('zoom-out').addEventListener('click', function(e) {
                              e.preventDefault();
                              e.stopPropagation();
                              if (zoomLevel > 0.5) {
                                zoomLevel -= 0.25;
                                updateZoom();
                              }
                            });
                            
                            document.getElementById('zoom-reset').addEventListener('click', function(e) {
                              e.preventDefault();
                              e.stopPropagation();
                              zoomLevel = 1.0;
                              updateZoom();
                            });
                            
                            let touchStartX = 0;
                            let touchStartY = 0;
                            let touchMoved = false;
                            
                            document.body.addEventListener('touchstart', function(e) {
                              if (e.touches.length === 1) {
                                touchStartX = e.touches[0].clientX;
                                touchStartY = e.touches[0].clientY;
                                touchMoved = false;
                              }
                            }, { passive: true });
                            
                            document.body.addEventListener('touchmove', function(e) {
                              if (e.touches.length === 1) {
                                const dx = e.touches[0].clientX - touchStartX;
                                const dy = e.touches[0].clientY - touchStartY;
                                if (Math.sqrt(dx * dx + dy * dy) > 8) {
                                  touchMoved = true;
                                }
                              }
                            }, { passive: true });
                            
                            document.body.addEventListener('click', function(e) {
                              if (touchMoved) {
                                touchMoved = false;
                                return;
                              }
                              
                              if (e.target.closest('#zoom-controls')) {
                                return;
                              }
                              
                              const items = document.querySelectorAll('.note, .rest');
                              let closestEl = null;
                              let minDistance = Infinity;
                              
                              const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);
                              const threshold = isTouch ? 50 : 20;
                              
                              items.forEach(function(item) {
                                const rect = item.getBoundingClientRect();
                                const centerX = rect.left + rect.width / 2;
                                const centerY = rect.top + rect.height / 2;
                                
                                const dx = e.clientX - centerX;
                                const dy = e.clientY - centerY;
                                const dist = Math.sqrt(dx * dx + dy * dy);
                                
                                if (dist < minDistance) {
                                  minDistance = dist;
                                  closestEl = item;
                                }
                              });
                              
                              if (closestEl && minDistance <= threshold) {
                                const itemId = closestEl.getAttribute('id');
                                if (itemId) {
                                  document.querySelectorAll('.note, .rest').forEach(function(el) {
                                    el.classList.remove('selected-edit-item');
                                  });
                                  closestEl.classList.add('selected-edit-item');
                                  
                                  const msg = JSON.stringify({ type: 'PREVIEW_ITEM_CLICKED', itemId: itemId });
                                  if (window.ReactNativeWebView) {
                                    window.ReactNativeWebView.postMessage(msg);
                                  }
                                  if (window.parent) {
                                    window.parent.postMessage(msg, '*');
                                  }
                                }
                              } else {
                                document.querySelectorAll('.note, .rest').forEach(function(el) {
                                  el.classList.remove('selected-edit-item');
                                });
                                const msg = JSON.stringify({ type: 'PREVIEW_DESELECT' });
                                if (window.ReactNativeWebView) {
                                  window.ReactNativeWebView.postMessage(msg);
                                }
                                if (window.parent) {
                                  window.parent.postMessage(msg, '*');
                                }
                              }
                            });
                            
                            const observer = new MutationObserver(function() {
                              observer.disconnect();
                              updateZoom();
                              const pIdx = ${selectedPitchIndex || 0};
                              const selectedIdStr = "${selectedEditItemId || ''}";
                              let activeId = "";
                              if (selectedIdStr) {
                                activeId = pIdx > 0 ? selectedIdStr + "_c" + pIdx : selectedIdStr;
                              }
                              if (activeId) {
                                const activeEl = document.getElementById(activeId);
                                if (activeEl) {
                                  document.querySelectorAll('.note, .rest').forEach(function(el) {
                                    el.classList.remove('selected-edit-item');
                                  });
                                  activeEl.classList.add('selected-edit-item');
                                }
                              }
                              observer.observe(document.body, { childList: true, subtree: true });
                            });
                            observer.observe(document.body, { childList: true, subtree: true });
                            
                            updateZoom();
                            
                            const pIdx = ${selectedPitchIndex || 0};
                            const selectedIdStr = "${selectedEditItemId || ''}";
                            let activeId = "";
                            if (selectedIdStr) {
                              activeId = pIdx > 0 ? selectedIdStr + "_c" + pIdx : selectedIdStr;
                            }
                            if (activeId) {
                              const activeEl = document.getElementById(activeId);
                              if (activeEl) {
                                document.querySelectorAll('.note, .rest').forEach(function(el) {
                                  el.classList.remove('selected-edit-item');
                                });
                                activeEl.classList.add('selected-edit-item');
                              }
                            }

                            // STEP 2: Verify SVG exists in DOM
                            console.log("[POPUP SVG]", document.querySelector('#popup-preview svg'));

                            // STEP 3: Verify SVG size
                            const previewSvg = document.querySelector('#popup-preview svg');
                            if (previewSvg) {
                              console.log("[POPUP SVG SIZE]", previewSvg.getBoundingClientRect());
                            } else {
                              console.log("[POPUP SVG SIZE] SVG not found");
                            }
                          </script>
                        </body>
                      </html>
                    `}
                    style={{ border: 'none', width: '100%', height: '100%' }}
                  />
                ) : (
                  <WebView
                    originWhitelist={['*']}
                    scalesPageToFit={true}
                    bouncesZoom={true}
                    source={{
                      html: `
                        <!DOCTYPE html>
                        <html>
                          <head>
                            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes" />
                            <style>
                              body, html {
                                margin: 0;
                                padding: 0;
                                width: 100%;
                                height: 100%;
                                overflow: auto;
                                background-color: white;
                                color: #18181b;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                position: relative;
                                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                                -webkit-overflow-scrolling: touch;
                              }
                              svg {
                                position: absolute;
                                top: 0;
                                left: 0;
                                width: 100%;
                                height: 100%;
                                display: block;
                                transition: width 0.2s ease, height 0.2s ease;
                              }
                              .selected-edit-item * {
                                fill: #8b5cf6 !important;
                                stroke: #8b5cf6 !important;
                                color: #8b5cf6 !important;
                              }
                              .note, .rest {
                                cursor: pointer !important;
                                pointer-events: all !important;
                              }
                            </style>
                          </head>
                          <body>
                            <div id="popup-preview" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: white; box-sizing: border-box; overflow: hidden; position: relative;">
                              ${modalPreviewSvg}
                            </div>
                            <script>
                              let touchStartX = 0;
                              let touchStartY = 0;
                              let touchMoved = false;
                              
                              document.body.addEventListener('touchstart', function(e) {
                                if (e.touches.length === 1) {
                                  touchStartX = e.touches[0].clientX;
                                  touchStartY = e.touches[0].clientY;
                                  touchMoved = false;
                                }
                              }, { passive: true });
                              
                              document.body.addEventListener('touchmove', function(e) {
                                if (e.touches.length === 1) {
                                  const dx = e.touches[0].clientX - touchStartX;
                                  const dy = e.touches[0].clientY - touchStartY;
                                  if (Math.sqrt(dx * dx + dy * dy) > 8) {
                                    touchMoved = true;
                                  }
                                }
                              }, { passive: true });
                              
                              document.body.addEventListener('click', function(e) {
                                if (touchMoved) {
                                  touchMoved = false;
                                  return;
                                }
                                
                                const items = document.querySelectorAll('.note, .rest');
                                let closestEl = null;
                                let minDistance = Infinity;
                                
                                const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);
                                const threshold = isTouch ? 50 : 20;
                                
                                items.forEach(function(item) {
                                  const rect = item.getBoundingClientRect();
                                  const centerX = rect.left + rect.width / 2;
                                  const centerY = rect.top + rect.height / 2;
                                  
                                  const dx = e.clientX - centerX;
                                  const dy = e.clientY - centerY;
                                  const dist = Math.sqrt(dx * dx + dy * dy);
                                  
                                  if (dist < minDistance) {
                                    minDistance = dist;
                                    closestEl = item;
                                  }
                                });
                                
                                if (closestEl && minDistance <= threshold) {
                                  const itemId = closestEl.getAttribute('id');
                                  if (itemId) {
                                    document.querySelectorAll('.note, .rest').forEach(function(el) {
                                      el.classList.remove('selected-edit-item');
                                    });
                                    closestEl.classList.add('selected-edit-item');
                                    
                                    const msg = JSON.stringify({ type: 'PREVIEW_ITEM_CLICKED', itemId: itemId });
                                    if (window.ReactNativeWebView) {
                                      window.ReactNativeWebView.postMessage(msg);
                                    }
                                    if (window.parent) {
                                      window.parent.postMessage(msg, '*');
                                    }
                                  }
                                } else {
                                  document.querySelectorAll('.note, .rest').forEach(function(el) {
                                    el.classList.remove('selected-edit-item');
                                  });
                                  const msg = JSON.stringify({ type: 'PREVIEW_DESELECT' });
                                  if (window.ReactNativeWebView) {
                                    window.ReactNativeWebView.postMessage(msg);
                                  }
                                  if (window.parent) {
                                    window.parent.postMessage(msg, '*');
                                  }
                                }
                              });
                              
                              const observer = new MutationObserver(function() {
                                observer.disconnect();
                                const pIdx = ${selectedPitchIndex || 0};
                                const selectedIdStr = "${selectedEditItemId || ''}";
                                let activeId = "";
                                if (selectedIdStr) {
                                  activeId = pIdx > 0 ? selectedIdStr + "_c" + pIdx : selectedIdStr;
                                }
                                if (activeId) {
                                  const activeEl = document.getElementById(activeId);
                                  if (activeEl) {
                                    document.querySelectorAll('.note, .rest').forEach(function(el) {
                                      el.classList.remove('selected-edit-item');
                                    });
                                    activeEl.classList.add('selected-edit-item');
                                  }
                                }
                                observer.observe(document.body, { childList: true, subtree: true });
                              });
                              observer.observe(document.body, { childList: true, subtree: true });
                              
                              const pIdx = ${selectedPitchIndex || 0};
                              const selectedIdStr = "${selectedEditItemId || ''}";
                              let activeId = "";
                              if (selectedIdStr) {
                                activeId = pIdx > 0 ? selectedIdStr + "_c" + pIdx : selectedIdStr;
                              }
                              if (activeId) {
                                const activeEl = document.getElementById(activeId);
                                if (activeEl) {
                                  document.querySelectorAll('.note, .rest').forEach(function(el) {
                                    el.classList.remove('selected-edit-item');
                                  });
                                  activeEl.classList.add('selected-edit-item');
                                }
                              }

                              // STEP 2: Verify SVG exists in DOM
                              console.log("[POPUP SVG]", document.querySelector('#popup-preview svg'));

                              // STEP 3: Verify SVG size
                              const previewSvg = document.querySelector('#popup-preview svg');
                              if (previewSvg) {
                                console.log("[POPUP SVG SIZE]", previewSvg.getBoundingClientRect());
                              } else {
                                console.log("[POPUP SVG SIZE] SVG not found");
                              }
                            </script>
                          </body>
                        </html>
                      `
                    }}
                    onMessage={handleMessage}
                    style={{ flex: 1, backgroundColor: 'transparent' }}
                    scrollEnabled={false}
                  />
                )}
              </View>
            ) : null}

            {/* Scrollable Icon Grid / Editing Panel */}
            <ScrollView ref={modalScrollViewRef} style={styles.popupGridScroll} showsVerticalScrollIndicator={false}>
              {(() => {
                const note = selectedEditItem?.note;
                const isRest = note?.isRest;
                const notePitches = note ? (note.pitches && note.pitches.length > 0 ? note.pitches : [note.pitch || 'C4']) : [];
                const pIdx = selectedPitchIndex < notePitches.length ? selectedPitchIndex : 0;
                const currentPitch = notePitches[pIdx] || 'C4';
                const parts = getPitchParts(currentPitch);
                const hasBeams = note ? (note.beams && note.beams.length > 0) : false;

                const currentNotes = selectedEditItem
                  ? (score.staves[selectedEditItem.staffIndex].measures[selectedEditItem.measureIndex].notes || [])
                  : [];
                const noteIndex = selectedEditItem?.noteIndex;
                
                const isEighthOrSixteenth = note && !isRest && (note.type === 'eighth' || note.type === '16th');
                const isConnectedToLeft = note?.beams && note.beams.length > 0 && (note.beams[0] === 'end' || note.beams[0] === 'continue');
                const isConnectedToRight = note?.beams && note.beams.length > 0 && (note.beams[0] === 'begin' || note.beams[0] === 'continue');
                const isConnected = note?.beams && note.beams.length > 0;
                
                const nextNote = noteIndex !== undefined && noteIndex + 1 < currentNotes.length ? currentNotes[noteIndex + 1] : null;
                const prevNote = noteIndex !== undefined && noteIndex - 1 >= 0 ? currentNotes[noteIndex - 1] : null;
                
                const isCompatible = (other: any) => {
                  if (!other || other.isRest) return false;
                  return other.type === 'eighth' || other.type === '16th';
                };
                
                const canConnectLeft = !isConnectedToLeft && isCompatible(prevNote);
                const canConnectRight = !isConnectedToRight && isCompatible(nextNote);
                
                let connectDisabled = true;
                if (isEighthOrSixteenth) {
                  if (isConnectedToLeft && isConnectedToRight) {
                    connectDisabled = true;
                  } else if (isConnectedToLeft) {
                    connectDisabled = !canConnectRight;
                  } else if (isConnectedToRight) {
                    connectDisabled = !canConnectLeft;
                  } else {
                    connectDisabled = !canConnectLeft && !canConnectRight;
                  }
                }
                
                const disconnectDisabled = !isEighthOrSixteenth || !isConnected;

                return (
                  <View style={{ padding: 12, alignItems: 'stretch' }}>

                    

                    {/* Editing Controls - Only visible when a note/rest is selected */}
                    {selectedEditItem && !isRest && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700', marginBottom: 12 }}>
                          Editing {isRest ? 'Rest' : 'Note'}
                        </Text>

                        {/* Note Head Selector for Chords */}
                        {!isRest && notePitches.length > 1 && (
                          <View style={{ marginBottom: 12 }}>
                            <Text style={styles.pitchLabel}>Select Note Head to Edit:</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                              {notePitches.map((p: string, idx: number) => (
                                <Pressable
                                  key={'pitch_idx_' + idx}
                                  onPress={() => setSelectedPitchIndex(idx)}
                                  style={[
                                    styles.pitchButton,
                                    { flex: 0, minWidth: 60, paddingVertical: 6 },
                                    selectedPitchIndex === idx && styles.pitchButtonActive
                                  ]}
                                >
                                  <Text style={[styles.pitchButtonText, selectedPitchIndex === idx && styles.pitchButtonTextActive]}>
                                    {p}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          </View>
                        )}

                        {/* Restructured Pitch & Connection Controls Grid */}
                        {!isRest ? (
                          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                            {/* Left Column: Move Up / Move Down stacked */}
                            <View style={{ flex: 1, flexDirection: 'column', gap: 8 }}>
                              <Pressable
                                onPress={() => handleShiftDiatonically('up')}
                                style={({ pressed }) => [
                                  {
                                    backgroundColor: '#2c2c2e',
                                    borderWidth: 1,
                                    borderColor: '#48484a',
                                    paddingVertical: 45,
                                    borderRadius: 8,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexDirection: 'row',
                                    gap: 6
                                  },
                                  pressed && { opacity: 0.7 }
                                ]}
                              >
                                <Ionicons name="arrow-up-outline" size={18} color="white" />
                                <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Move Up</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => handleShiftDiatonically('down')}
                                style={({ pressed }) => [
                                  {
                                    backgroundColor: '#2c2c2e',
                                    borderWidth: 1,
                                    borderColor: '#48484a',
                                    paddingVertical: 45,
                                    borderRadius: 8,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexDirection: 'row',
                                    gap: 6
                                  },
                                  pressed && { opacity: 0.7 }
                                ]}
                              >
                                <Ionicons name="arrow-down-outline" size={18} color="white" />
                                <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Move Down</Text>
                              </Pressable>
                            </View>

                            {/* Right Column: Sharp | Flat | Natural | Dot row, Add Note Head, Connect, Disconnect */}
                            <View style={{ flex: 1.5, flexDirection: 'column', gap: 8 }}>
                              {/* Row of 4 buttons (Sharp, Flat, Natural, Dot) */}
                              <View style={{ flexDirection: 'row', gap: 4 }}>
                                <Pressable
                                  onPress={() => handleSetAccidental('#')}
                                  style={({ pressed }) => [
                                    {
                                      flex: 1,
                                      backgroundColor: parts.accidental === '#' ? '#8b5cf6' : '#2c2c2e',
                                      borderWidth: 1,
                                      borderColor: parts.accidental === '#' ? '#8b5cf6' : '#48484a',
                                      paddingVertical: 20, // Half of Move Up height (paddingVertical: 40)
                                      borderRadius: 6,
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    },
                                    pressed && { opacity: 0.7 }
                                  ]}
                                >
                                  <Text style={{ color: 'white', fontWeight: '700', fontSize: 10 }}>Sharp</Text>
                                </Pressable>

                                <Pressable
                                  onPress={() => handleSetAccidental('b')}
                                  style={({ pressed }) => [
                                    {
                                      flex: 1,
                                      backgroundColor: parts.accidental === 'b' ? '#8b5cf6' : '#2c2c2e',
                                      borderWidth: 1,
                                      borderColor: parts.accidental === 'b' ? '#8b5cf6' : '#48484a',
                                      paddingVertical: 20, // Half height
                                      borderRadius: 6,
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    },
                                    pressed && { opacity: 0.7 }
                                  ]}
                                >
                                  <Text style={{ color: 'white', fontWeight: '700', fontSize: 10 }}>Flat</Text>
                                </Pressable>

                                <Pressable
                                  onPress={() => handleSetAccidental('n')}
                                  style={({ pressed }) => [
                                    {
                                      flex: 1,
                                      backgroundColor: parts.accidental === 'n' ? '#8b5cf6' : '#2c2c2e',
                                      borderWidth: 1,
                                      borderColor: parts.accidental === 'n' ? '#8b5cf6' : '#48484a',
                                      paddingVertical: 20, // Half height
                                      borderRadius: 6,
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    },
                                    pressed && { opacity: 0.7 }
                                  ]}
                                >
                                  <Text style={{ color: 'white', fontWeight: '700', fontSize: 14, lineHeight: 14 }}>♮</Text>
                                </Pressable>

                                <Pressable
                                  onPress={handleToggleDot}
                                  style={({ pressed }) => [
                                    {
                                      flex: 1,
                                      backgroundColor: note.dot ? '#8b5cf6' : '#2c2c2e',
                                      borderWidth: 1,
                                      borderColor: note.dot ? '#8b5cf6' : '#48484a',
                                      paddingVertical: 20, // Half height
                                      borderRadius: 6,
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    },
                                    pressed && { opacity: 0.7 }
                                  ]}
                                >
                                  <Text style={{ color: 'white', fontWeight: '700', fontSize: 10 }}>Dot</Text>
                                </Pressable>
                              </View>

                              {/* Add Note Head button */}
                              <Pressable
                                onPress={handleAddNoteHead}
                                style={({ pressed }) => [
                                  {
                                    backgroundColor: '#2c2c2e',
                                    borderWidth: 1,
                                    borderColor: '#48484a',
                                    paddingVertical: 15,
                                    borderRadius: 8,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexDirection: 'row',
                                    gap: 6
                                  },
                                  pressed && { opacity: 0.7 }
                                ]}
                              >
                                <Ionicons name="add-outline" size={16} color="white" />
                                <Text style={{ color: 'white', fontWeight: '700', fontSize: 13 }}>Add Note Head</Text>
                              </Pressable>

                              {/* Connect Notes button */}
                              <Pressable
                                disabled={connectDisabled}
                                onPress={handleConnectNotes}
                                style={({ pressed }) => [
                                  {
                                    backgroundColor: '#2c2c2e',
                                    borderWidth: 1,
                                    borderColor: '#48484a',
                                    paddingVertical: 15,
                                    borderRadius: 8,
                                    alignItems: 'center',
                                    flexDirection: 'row',
                                    justifyContent: 'center',
                                    gap: 6,
                                    opacity: connectDisabled ? 0.4 : 1
                                  },
                                  connectDisabled ? null : pressed && { opacity: 0.7 }
                                ]}
                              >
                                <Ionicons name="git-commit-outline" size={16} color={connectDisabled ? '#8e8e93' : 'white'} />
                                <Text style={{ color: connectDisabled ? '#8e8e93' : 'white', fontWeight: '600', fontSize: 13 }}>Connect Notes</Text>
                              </Pressable>

                              {/* Disconnect button */}
                              <Pressable
                                disabled={disconnectDisabled}
                                onPress={handleDisconnectNotes}
                                style={({ pressed }) => [
                                  {
                                    backgroundColor: '#2c2c2e',
                                    borderWidth: 1,
                                    borderColor: '#48484a',
                                    paddingVertical: 15,
                                    borderRadius: 8,
                                    alignItems: 'center',
                                    flexDirection: 'row',
                                    justifyContent: 'center',
                                    gap: 6,
                                    opacity: disconnectDisabled ? 0.4 : 1
                                  },
                                  disconnectDisabled ? null : pressed && { opacity: 0.7 }
                                ]}
                              >
                                <Ionicons name="git-branch-outline" size={16} color={disconnectDisabled ? '#8e8e93' : 'white'} />
                                <Text style={{ color: disconnectDisabled ? '#8e8e93' : 'white', fontWeight: '600', fontSize: 13 }}>Disconnect</Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : (
                          // For rests, show Connect/Disconnect full width (disabled)
                          <View style={{ gap: 8, marginBottom: 12 }}>
                            <Pressable
                              disabled={true}
                              style={{
                                backgroundColor: '#2c2c2e',
                                borderWidth: 1,
                                borderColor: '#48484a',
                                paddingVertical: 12,
                                borderRadius: 8,
                                alignItems: 'center',
                                flexDirection: 'row',
                                justifyContent: 'center',
                                gap: 6,
                                opacity: 0.4
                              }}
                            >
                              <Ionicons name="git-commit-outline" size={16} color="#8e8e93" />
                              <Text style={{ color: '#8e8e93', fontWeight: '600', fontSize: 13 }}>Connect Notes</Text>
                            </Pressable>
                            <Pressable
                              disabled={true}
                              style={{
                                backgroundColor: '#2c2c2e',
                                borderWidth: 1,
                                borderColor: '#48484a',
                                paddingVertical: 12,
                                borderRadius: 8,
                                alignItems: 'center',
                                flexDirection: 'row',
                                justifyContent: 'center',
                                gap: 6,
                                opacity: 0.4
                              }}
                            >
                              <Ionicons name="git-branch-outline" size={16} color="#8e8e93" />
                              <Text style={{ color: '#8e8e93', fontWeight: '600', fontSize: 13 }}>Disconnect</Text>
                            </Pressable>
                          </View>
                        )}

                        {/* 7. Delete Note */}
                        <Pressable
                          onPress={handleRemoveNoteHead}
                          style={({ pressed }) => [
                            {
                              backgroundColor: '#2c2c2e',
                              borderWidth: 1,
                              borderColor: '#ea580c',
                              paddingVertical: 12,
                              borderRadius: 8,
                              alignItems: 'center',
                              flexDirection: 'row',
                              justifyContent: 'center',
                              gap: 6,
                              marginBottom: 12
                            },
                            pressed && { opacity: 0.7 }
                          ]}
                        >
                          <Ionicons name="trash-outline" size={16} color="#ea580c" />
                          <Text style={{ color: '#ea580c', fontWeight: '700', fontSize: 13 }}>Delete Note</Text>
                        </Pressable>
                      </View>
                    )}

                    {/* Duration Grid (Moved to Top) */}
                    <View style={{ marginBottom: 12 }}>
                      <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700', marginBottom: 12 }}>
                        {selectedEditItem ? 'Replace Duration' : 'Insert Duration'}
                      </Text>
                      {/* Row 1: 3 buttons */}
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                        {(noteModalSubMode === 'duration' ? NOTE_OPTIONS : REST_OPTIONS).slice(0, 3).map((option) => {
                          const optionDur = NOTE_TYPE_BASE_DURS[option.value] || 0;
                          const selectedDur = selectedEditItem?.note?.duration || 0;
                          const isRestOptionDisabled = noteModalSubMode === 'rest' && selectedEditItem && !selectedEditItem.note.isRest && optionDur > selectedDur;
                          return (
                            <Pressable
                              key={option.value}
                              disabled={isRestOptionDisabled}
                              onPress={() => {
                                if (selectedEditItem) {
                                  handleReplaceItem(option.value, noteModalSubMode === 'rest');
                                } else {
                                  handleInsertNote(option.value, noteModalSubMode === 'rest');
                                }
                              }}
                              style={({ pressed }) => [
                                styles.card,
                                {
                                  flex: 1,
                                  backgroundColor: isRestOptionDisabled ? '#1c1c1e' : '#2c2c2e',
                                  borderColor: '#3a3a3c',
                                  paddingVertical: 12,
                                  borderRadius: 8,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  opacity: isRestOptionDisabled ? 0.3 : 1
                                },
                                !isRestOptionDisabled && pressed && { backgroundColor: '#3a3a3c', borderColor: '#8b5cf6' }
                              ]}
                            >
                              <Text style={styles.cardSymbol}>{option.symbol}</Text>
                              <Text style={styles.cardLabel}>{option.label}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      {/* Row 2: 2 buttons + toggle */}
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {(noteModalSubMode === 'duration' ? NOTE_OPTIONS : REST_OPTIONS).slice(3, 5).map((option) => {
                          const optionDur = NOTE_TYPE_BASE_DURS[option.value] || 0;
                          const selectedDur = selectedEditItem?.note?.duration || 0;
                          const isRestOptionDisabled = noteModalSubMode === 'rest' && selectedEditItem && !selectedEditItem.note.isRest && optionDur > selectedDur;
                          return (
                            <Pressable
                              key={option.value}
                              disabled={isRestOptionDisabled}
                              onPress={() => {
                                if (selectedEditItem) {
                                  handleReplaceItem(option.value, noteModalSubMode === 'rest');
                                } else {
                                  handleInsertNote(option.value, noteModalSubMode === 'rest');
                                }
                              }}
                              style={({ pressed }) => [
                                styles.card,
                                {
                                  flex: 1,
                                  backgroundColor: isRestOptionDisabled ? '#1c1c1e' : '#2c2c2e',
                                  borderColor: '#3a3a3c',
                                  paddingVertical: 12,
                                  borderRadius: 8,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  opacity: isRestOptionDisabled ? 0.3 : 1
                                },
                                !isRestOptionDisabled && pressed && { backgroundColor: '#3a3a3c', borderColor: '#8b5cf6' }
                              ]}
                            >
                              <Text style={styles.cardSymbol}>{option.symbol}</Text>
                              <Text style={styles.cardLabel}>{option.label}</Text>
                            </Pressable>
                          );
                        })}
                        {/* Toggle Button */}
                        <Pressable
                          onPress={() => setNoteModalSubMode(prev => prev === 'duration' ? 'rest' : 'duration')}
                          style={({ pressed }) => [
                            styles.card,
                            {
                              flex: 1,
                              backgroundColor: '#2c2c2e',
                              borderColor: '#48484a',
                              paddingVertical: 12,
                              borderRadius: 8,
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderWidth: 1,
                            },
                            pressed && { opacity: 0.7 }
                          ]}
                        >
                          <Ionicons name={noteModalSubMode === 'duration' ? 'ellipse-outline' : 'musical-notes-outline'} size={24} color="white" />
                          <Text style={{ color: 'white', fontWeight: '700', fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                            {noteModalSubMode === 'duration' ? 'To Rests' : 'To Notes'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>

                    {/* 8. Clear Measure */}
                    <Pressable
                      onPress={handleClearMeasure}
                      style={({ pressed }) => [
                        {
                          backgroundColor: '#2c2c2e',
                          borderWidth: 1,
                          borderColor: '#ef4444',
                          paddingVertical: 12,
                          borderRadius: 8,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: 8,
                          flexDirection: 'row',
                          gap: 6
                        },
                        pressed && { opacity: 0.7 }
                      ]}
                    >
                      <Ionicons name="refresh-outline" size={16} color="#ef4444" />
                      <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 13 }}>Clear Measure</Text>
                    </Pressable>
                  </View>
                );
              })()}
            </ScrollView>

            {/* Fixed Cancel Button at Bottom */}
            <View style={styles.modalFooter}>
              <Pressable style={styles.cancelButton} onPress={closeNoteSelectionModal}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Measure Editor Modal */}
      <Modal visible={showMeasureEditorModal} transparent animationType="fade">
        <View style={styles.popupModalOverlay}>
          <View style={styles.popupModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Measure Editor (Bar {selectedMeasureIndex !== null ? selectedMeasureIndex + 1 : 1})</Text>
              <Pressable onPress={() => {
                setShowMeasureEditorModal(false);
                setSelectedMeasureIndex(null);
                setSelectedBarId(null);
              }}>
                <Text style={styles.modalClose}>Done</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {/* Measure Staff Tabs Selector */}
              <View style={styles.tabContainer}>
                {score.staves.map((staff, idx) => (
                  <Pressable
                    key={staff.id}
                    onPress={() => {
                      setEditingStaffIndex(idx);
                      setSelectedNoteIndex(null);
                    }}
                    style={[
                      styles.tabButton,
                      editingStaffIndex === idx && styles.tabButtonActive
                    ]}
                  >
                    <Text style={[
                      styles.tabButtonText,
                      editingStaffIndex === idx && styles.tabButtonTextActive
                    ]}>
                      {staff.clef.charAt(0).toUpperCase() + staff.clef.slice(1) + ' Clef'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Single Measure Preview SVG Card */}
              {selectedMeasureIndex !== null && (
                <View style={styles.previewCard}>
                  {(() => {
                    const measureXML = generateSingleMeasureXML(score, selectedMeasureIndex);
                    console.log('[DEBUG] staves:', score.staves?.length);
                    console.log('[DEBUG] measures:', score.staves?.[0]?.measures?.length);
                    console.log('[DEBUG] musicXML generated:', !!measureXML);
                    console.log("=== CREATE PAGE USING SHEETMUSIC ===");
                    console.log("CREATE -> rendering SheetMusic");
                    return (
                      <SheetMusic
                        key="measure-editor-preview"
                        notes={dummyNotes}
                        timeSignature={score.timeSignature}
                        detectedTempo={score.tempo}
                        musicxml={measureXML}
                        hideHeader={true}
                        hideFooter={true}
                        borderless={true}
                        id="measure-editor-preview"
                        score={score}
                        staves={score.staves}
                        selectedNoteId={selectedNote?.id || undefined}
                        selectedNoteIds={selectedNoteIds}
                      />
                      
                    );
                  })()}
                </View>
              )}

              {/* Measure Notes Selector */}
              <Text style={styles.sectionTitle}>Measure Notes</Text>
              {userNotes.length === 0 ? (
                <Text style={styles.emptyText}>No notes added yet. (Measure is filled with auto rests)</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, paddingHorizontal: 16 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {userNotes.map((note: any, idx: number) => {
                      const isSelected = selectedNoteIndex === idx;
                      return (
                        <Pressable
                          key={note.id || idx}
                          onPress={() => setSelectedNoteIndex(idx)}
                          style={[
                            styles.noteCard,
                            isSelected && styles.noteCardSelected
                          ]}
                        >
                          <Text style={[styles.noteCardText, isSelected && styles.noteCardTextSelected]}>
                            {note.isRest ? 'Rest' : note.pitch}
                          </Text>
                          <Text style={[styles.noteCardSubtext, isSelected && styles.noteCardSubtextSelected]}>
                            {note.type} {note.dot ? '•' : ''}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              )}

              {/* Insert Note Palette */}
              <Text style={styles.sectionTitle}>Insert Note</Text>
              <View style={styles.paletteContainer}>
                <View style={styles.paletteRow}>
                  {['whole', 'half', 'quarter', 'eighth', '16th'].map((type) => (
                    <Pressable
                      key={'note_' + type}
                      onPress={() => handleInsertNote(type, false)}
                      style={styles.paletteButton}
                    >
                      <Ionicons name="musical-note-outline" size={16} color="white" />
                      <Text style={styles.paletteButtonText}>{type}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Insert Rest Palette */}
              <Text style={styles.sectionTitle}>Insert Rest</Text>
              <View style={styles.paletteContainer}>
                <View style={styles.paletteRow}>
                  {['whole', 'half', 'quarter', 'eighth', '16th'].map((type) => (
                    <Pressable
                      key={'rest_' + type}
                      onPress={() => handleInsertNote(type, true)}
                      style={[styles.paletteButton, { backgroundColor: '#2c2c2e' }]}
                    >
                      <Ionicons name="ellipse-outline" size={16} color="white" />
                      <Text style={styles.paletteButtonText}>{type}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Edit Selected Note Section */}
              {selectedNote && (
                <View style={styles.editSection}>
                  <Text style={styles.sectionTitle}>Edit Selected Note</Text>
                  
                  {/* Actions Row */}
                  <View style={styles.editActionsRow}>
                    <Pressable
                      onPress={() => handleModifyNote(selectedNoteIndex!, { isRest: !selectedNote.isRest, pitch: !selectedNote.isRest ? 'rest' : (editingStaffIndex === 0 ? 'C5' : 'C3') })}
                      style={styles.editActionButton}
                    >
                      <Ionicons name={selectedNote.isRest ? "musical-note" : "ellipse-outline"} size={16} color="white" />
                      <Text style={styles.editActionButtonText}>{selectedNote.isRest ? 'Make Note' : 'Make Rest'}</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => handleModifyNote(selectedNoteIndex!, { dot: !selectedNote.dot })}
                      style={[styles.editActionButton, selectedNote.dot && { backgroundColor: '#ff9500' }]}
                    >
                      <Ionicons name="ellipse" size={12} color="white" />
                      <Text style={styles.editActionButtonText}>{selectedNote.dot ? 'Remove Dot' : 'Add Dot'}</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        handleDeleteNote(selectedNoteIndex!);
                      }}
                      style={[styles.editActionButton, { backgroundColor: '#ba1a1a' }]}
                    >
                      <Ionicons name="trash-outline" size={16} color="white" />
                      <Text style={styles.editActionButtonText}>Delete</Text>
                    </Pressable>
                  </View>

                  {/* Pitch Selector (Note only) */}
                  {!selectedNote.isRest && (
                    <View style={styles.pitchSelector}>
                      {/* Step Row */}
                      <Text style={styles.pitchLabel}>Pitch Step</Text>
                      <View style={styles.pitchRow}>
                        {['C', 'D', 'E', 'F', 'G', 'A', 'B'].map((s) => (
                          <Pressable
                            key={'step_' + s}
                            onPress={() => updateSelectedNotePitch({ step: s })}
                            style={[styles.pitchButton, pitchParts.step === s && styles.pitchButtonActive]}
                          >
                            <Text style={[styles.pitchButtonText, pitchParts.step === s && styles.pitchButtonTextActive]}>{s}</Text>
                          </Pressable>
                        ))}
                      </View>

                      {/* Accidental Row */}
                      <Text style={styles.pitchLabel}>Accidental</Text>
                      <View style={styles.pitchRow}>
                        {[
                          { label: 'Default', value: '' },
                          { label: 'Natural', value: 'n' },
                          { label: '♯ Sharp', value: '#' },
                          { label: '♭ Flat', value: 'b' }
                        ].map((acc) => (
                          <Pressable
                            key={'acc_' + acc.value}
                            onPress={() => updateSelectedNotePitch({ accidental: acc.value })}
                            style={[styles.pitchButton, { flex: 1 }, pitchParts.accidental === acc.value && styles.pitchButtonActive]}
                          >
                            <Text style={[styles.pitchButtonText, pitchParts.accidental === acc.value && styles.pitchButtonTextActive]}>{acc.label}</Text>
                          </Pressable>
                        ))}
                      </View>

                      {/* Octave Row */}
                      <Text style={styles.pitchLabel}>Octave</Text>
                      <View style={styles.pitchRow}>
                        {['2', '3', '4', '5', '6'].map((oct) => (
                          <Pressable
                            key={'oct_' + oct}
                            onPress={() => updateSelectedNotePitch({ octave: oct })}
                            style={[styles.pitchButton, pitchParts.octave === oct && styles.pitchButtonActive]}
                          >
                            <Text style={[styles.pitchButtonText, pitchParts.octave === oct && styles.pitchButtonTextActive]}>{oct}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 64 : 40,
  },
  choiceHeader: {
    marginBottom: 40,
  },
  choiceTitle: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  choiceSubtitle: {
    color: '#8e8e93',
    fontSize: 16,
    marginTop: 8,
  },
  cardContainer: {
    gap: 20,
  },
  choiceCard: {
    flexDirection: 'row',
    backgroundColor: '#1c1c1e',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1.5,
  },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#e3fce7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardContent: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: '#aeaeae',
    fontSize: 13,
    lineHeight: 18,
  },
  // Editor Styles
  editorMainContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  navbar: {
    height: Platform.OS === 'ios' ? 90 : 60,
    paddingTop: Platform.OS === 'ios' ? 44 : 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c1e',
    backgroundColor: '#000000',
    paddingHorizontal: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    color: '#ff9500',
    fontSize: 16,
    marginLeft: 2,
    fontWeight: '600',
  },
  navbarTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  editorWorkspace: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    display: 'none',
    width: 200,
    backgroundColor: '#121214',
    borderRightWidth: 1,
    borderRightColor: '#1c1c1e',
  },
  sidebarScroll: {
    padding: 12,
    paddingBottom: 40,
  },
  sidebarHeader: {
    color: '#ff9500',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 8,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    color: '#8e8e93',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#1c1c1e',
    color: '#ffffff',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  pickerSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  pickerSelectorText: {
    color: '#ffffff',
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: '#1c1c1e',
    marginVertical: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff9500',
    borderRadius: 8,
    paddingVertical: 8,
    gap: 6,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  placeholderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
    gap: 8,
    opacity: 0.6,
  },
  placeholderButtonText: {
    color: '#aaaaaa',
    fontSize: 12,
    fontWeight: '600',
  },
  mainSheetArea: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#f4f4f5',
  },
  sheetScrollView: {
    flex: 1,
  },
  sheetContainer: {
    padding: 16,
    alignItems: 'stretch',
    minHeight: 1000,
  },
  documentCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    //boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
  },
  documentHeader: {
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f5',
    paddingBottom: 12,
  },
  docTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
    ...Platform.select({
      web: {
        userSelect: 'none' as any,
      },
    }),
  },
  docAuthor: {
    fontSize: 14,
    color: '#555555',
    marginTop: 4,
    fontStyle: 'italic',
    ...Platform.select({
      web: {
        userSelect: 'none' as any,
      },
    }),
  },
  docMetaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  docMetaText: {
    fontSize: 11,
    color: '#888888',
    fontWeight: '600',
  },
  metaClickable: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f4f4f5',
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  metaClickablePressed: {
    backgroundColor: '#e4e4e7',
  },
  webViewWrapper: {
    width: '100%',
    minHeight: 600,
    backgroundColor: '#ffffff',
  },
  // Modal Picker Styles
  modalOverlay: {
    ...Platform.select({
      web: {
        position: 'fixed' as any,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'flex-end',
        zIndex: 10000,
      },
      default: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'flex-end',
      },
    }),
  },
  modalContent: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: 500,
    paddingBottom: 24,
    width: '100%',
    ...Platform.select({
      web: {
        maxWidth: 500,
        alignSelf: 'center',
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2c2c2e',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  modalClose: {
    color: '#ff9500',
    fontSize: 16,
    fontWeight: '600',
  },
  modalScroll: {
    padding: 8,
  },
  modalItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2c2c2e',
  },
  modalItemText: {
    color: '#ffffff',
    fontSize: 15,
  },
  // Text Formatting and Playback Styles
  editableTextContainer: {
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editableTextContainerHoverable: {
    borderWidth: 1,
    borderColor: '#e4e4e7',
    borderStyle: 'dashed',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  selectedEditableText: {
    borderColor: '#ff9500',
    backgroundColor: '#fff7ed',
    borderStyle: 'dashed',
  },
  floatingToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderRadius: 8,
    padding: 6,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    gap: 8,
    marginBottom: 12,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2c2c2e',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 4,
  },
  toolbarBtnActive: {
    backgroundColor: '#ff9500',
  },
  toolbarBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  toolbarSizeBtn: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#2c2c2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolbarSizeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    minWidth: 16,
    textAlign: 'center',
  },
  toolbarCloseBtn: {
    paddingLeft: 4,
  },
  textEditHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  buttonGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  formatOptionButton: {
    backgroundColor: '#1c1c1e',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    minWidth: 70,
    alignItems: 'center',
  },
  formatOptionButtonActive: {
    backgroundColor: '#ff9500',
    borderColor: '#ff9500',
  },
  formatOptionButtonText: {
    color: '#aaaaaa',
    fontSize: 11,
    fontWeight: '600',
  },
  formatOptionButtonTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  fontSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  fontSizeBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#1c1c1e',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  fontSizeValue: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
  },
  styleOptionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  styleToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1c1c1e',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    flex: 1,
    justifyContent: 'center',
  },
  styleToggleBtnActive: {
    backgroundColor: '#ff9500',
    borderColor: '#ff9500',
  },
  styleToggleText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  styleToggleTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  playbackBarContainer: {
    backgroundColor: '#121214',
    borderTopWidth: 1,
    borderTopColor: '#1c1c1e',
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: '100%',
  },
  // Collapse and Measure Editor Modal Custom Styles
  collapseToggle: {
    display: 'none',
    position: 'absolute',
    left: 200,
    top: '50%',
    marginTop: -20,
    width: 24,
    height: 40,
    backgroundColor: '#1c1c1e',
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    borderLeftWidth: 0,
  },
  collapseToggleCollapsed: {
    left: 0,
  },
  collapseToggleExpanded: {
    left: 200,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1c1c1e',
    padding: 4,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabButtonActive: {
    backgroundColor: '#ff9500',
  },
  tabButtonText: {
    color: '#aeaeae',
    fontSize: 13,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  previewCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginHorizontal: 16,
    padding: 8,
    marginBottom: 20,
    overflow: 'hidden',
  },
  sectionTitle: {
    color: '#ff9500',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginHorizontal: 16,
    marginBottom: 10,
    marginTop: 10,
  },
  emptyText: {
    color: '#8e8e93',
    fontSize: 13,
    marginHorizontal: 16,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  noteCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    alignItems: 'center',
    minWidth: 70,
  },
  noteCardSelected: {
    borderColor: '#ff9500',
    backgroundColor: '#ff950015',
  },
  noteCardText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  noteCardTextSelected: {
    color: '#ff9500',
  },
  noteCardSubtext: {
    color: '#8e8e93',
    fontSize: 11,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  noteCardSubtextSelected: {
    color: '#ff950090',
  },
  paletteContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  paletteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paletteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff9500',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  paletteButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  editSection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2c2c2e',
    paddingTop: 10,
    paddingBottom: 20,
  },
  editActionsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  editActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2c2c2e',
    borderRadius: 8,
    paddingVertical: 10,
    gap: 6,
  },
  editActionButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  pitchSelector: {
    marginHorizontal: 16,
    gap: 12,
  },
  pitchLabel: {
    color: '#8e8e93',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: -4,
  },
  pitchRow: {
    flexDirection: 'row',
    gap: 6,
  },
  pitchButton: {
    flex: 1,
    backgroundColor: '#1c1c1e',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  pitchButtonActive: {
    backgroundColor: '#ff9500',
    borderColor: '#ff9500',
  },
  pitchButtonText: {
    color: '#aeaeae',
    fontSize: 13,
    fontWeight: '600',
  },
  pitchButtonTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  popupModalOverlay: {
    ...Platform.select({
      web: {
        position: 'fixed' as any,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10000,
      },
      default: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'center',
        alignItems: 'center',
      },
    }),
  },
  popupModalContent: {
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    width: '95%',
    maxWidth: 500,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
  },
  floatingPitchContainer: {
    position: 'absolute',
    bottom: 110,
    right: 24,
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#3a3a3c',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 999,
    width: 290,
  },
  floatingPitchHeader: {
    marginBottom: 8,
    alignItems: 'center',
  },
  floatingPitchTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  floatingPitchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  floatingPitchButton: {
    flex: 1,
    height: 38,
    backgroundColor: '#ff9500',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  floatingPitchBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  floatingActionBar: {
    position: 'absolute',
    bottom: 100,
    left: '10%',
    right: '10%',
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#2c2c2e',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9999,
  },
  floatingActionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  floatingActionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  floatingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  floatingButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  popupTabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#2c2c2e',
    backgroundColor: '#1c1c1e',
  },
  popupTabButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  popupTabButtonActive: {
    borderBottomColor: '#8b5cf6',
  },
  popupTabButtonText: {
    color: '#8e8e93',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  popupTabButtonTextActive: {
    color: '#8b5cf6',
  },
  popupTabSeparator: {
    width: 1,
    height: '60%',
    backgroundColor: '#2c2c2e',
    alignSelf: 'center',
  },
  popupGridScroll: {
    maxHeight: 420,
    padding: 12,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingBottom: 8,
  },
  card: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: '#2c2c2e',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
    margin: '1.6%',
    borderWidth: 1,
    borderColor: '#3a3a3c',
  },
  cardSymbol: {
    fontSize: 36,
    color: '#ffffff',
    marginBottom: 6,
    textAlign: 'center',
  },
  cardLabel: {
    fontSize: 12,
    color: '#aeaeae',
    textAlign: 'center',
    fontWeight: '600',
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#2c2c2e',
    backgroundColor: '#1c1c1e',
  },
  cancelButton: {
    backgroundColor: '#3a3a3c',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  cancelButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});