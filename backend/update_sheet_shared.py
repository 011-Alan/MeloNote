# update_sheet_shared.py
import os

filepath = "../src/components/sheetMusicShared.ts"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Find the start of function escapeJsonForHtml
idx = content.find("function escapeJsonForHtml")
if idx == -1:
    print("Could not find escapeJsonForHtml")
    exit(1)

new_code = """export function base64Encode(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  const len = str.length;
  while (i < len) {
    const c1 = str.charCodeAt(i++) & 0xff;
    if (i === len) {
      out += chars.charAt(c1 >> 2);
      out += chars.charAt((c1 & 0x3) << 4);
      out += '==';
      break;
    }
    const c2 = str.charCodeAt(i++);
    if (i === len) {
      out += chars.charAt(c1 >> 2);
      out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4));
      out += chars.charAt((c2 & 0xf) << 2);
      out += '=';
      break;
    }
    const c3 = str.charCodeAt(i++);
    out += chars.charAt(c1 >> 2);
    out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4));
    out += chars.charAt(((c2 & 0xf) << 2) | ((c3 & 0xc0) >> 6));
    out += chars.charAt(c3 & 0x3f);
  }
  return out;
}

function escapeJsonForHtml(
  value: unknown
) {
  return JSON.stringify(value)
    .replace(/</g, '\\\\u003c')
    .replace(/>/g, '\\\\u003e')
    .replace(/&/g, '\\\\u0026');
}

export function buildSheetMusicHtml(
  notes: any,
  timeSignature: string = "4/4",
  detectedTempo?: number | null,
  musicxml?: string
) {
  let payload = "";
  
  const mapNote = (note: any) => ({
    accidental: note.accidental,
    clef: note.clef,
    display: note.display,
    letter: note.letter ? note.letter.toLowerCase() : "r",
    octave: note.octave,
    midi: note.midi,
    duration: note.duration,
    absoluteIndex: note.absoluteIndex,
    pitch: note.pitch,
    beats: note.beats,
    pitch_beats: note.pitch_beats
  });

  if (notes && !Array.isArray(notes) && notes.treble && notes.bass) {
    const escapedTreble = notes.treble.map(mapNote);
    const escapedBass = notes.bass.map(mapNote);
    const escapedPlayback = Array.isArray(notes.playback) ? notes.playback.map(mapNote) : [];
    payload = escapeJsonForHtml({
      treble: escapedTreble,
      bass: escapedBass,
      notes: escapedPlayback
    });
  } else {
    const arr = Array.isArray(notes) ? notes : [];
    payload = escapeJsonForHtml(arr.map(mapNote));
  }

  const musicxmlBase64 = musicxml ? base64Encode(musicxml) : '';

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0"
    />
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #18181b;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        width: 100%;
        overflow-x: hidden;
      }

      .player-container {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 16px;
        background: #ffffff;
        box-sizing: border-box;
      }

      .player-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        padding: 0 4px;
        box-sizing: border-box;
      }

      .tempo-control {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
      }

      .tempo-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        flex-wrap: wrap;
        gap: 8px;
      }

      .tempo-control label {
        font-size: 14px;
        color: #71717a;
        font-weight: 600;
        white-space: nowrap;
      }

      .detected-tempo-text {
        font-size: 13px;
        color: #71717a;
        font-weight: 500;
      }

      .orig-tempo-btn {
        background: #f4f4f5;
        color: #18181b;
        border: 1px solid #e4e4e7;
        padding: 5px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }

      .tempo-control input[type="range"] {
        width: 100%;
        height: 6px;
        background: #e4e4e7;
        border-radius: 3px;
        outline: none;
        -webkit-appearance: none;
        appearance: none;
      }

      .tempo-control input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #ffffff;
        border: 2px solid #ff9500;
        box-shadow: 0 2px 4px rgba(0,0,0,0.15);
        cursor: pointer;
        transition: transform 0.1s;
      }

      .tempo-control input[type="range"]::-webkit-slider-thumb:hover {
        transform: scale(1.15);
      }

      .tempo-control input[type="range"]::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #ffffff;
        border: 2px solid #ff9500;
        box-shadow: 0 2px 4px rgba(0,0,0,0.15);
        cursor: pointer;
        transition: transform 0.1s;
      }

      .tempo-control input[type="range"]::-moz-range-thumb:hover {
        transform: scale(1.15);
      }

      .player-btn {
        background: #f4f4f5;
        color: #18181b;
        border: 1px solid #e4e4e7;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        padding: 0;
      }

      .player-btn:hover {
        background: #ff9500;
        border-color: #ff9500;
        color: #ffffff;
        transform: scale(1.05);
      }

      .player-btn:active {
        transform: scale(0.95);
      }

      .play-btn {
        background: #ff9500;
        border-color: #ff9500;
        color: #ffffff;
        width: 46px;
        height: 46px;
        box-shadow: 0 4px 10px rgba(255, 149, 0, 0.3);
      }

      .play-btn:hover {
        background: #ffa82e;
        border-color: #ffa82e;
        color: #ffffff;
        transform: scale(1.08);
      }

      #score-wrap {
        width: 100%;
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
        background: #ffffff;
        border-radius: 18px;
        padding: 12px;
        box-sizing: border-box;
        border: 1px solid #e4e4e7;
      }

      #score {
        min-height: 380px;
      }

      .player-footer {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
        background: #f4f4f5;
        padding: 16px;
        border-radius: 16px;
        box-sizing: border-box;
        border: 1px solid #e4e4e7;
      }

      .timeline-row {
        display: flex;
        align-items: center;
        gap: 16px;
        width: 100%;
      }

      .controls-row {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 16px;
        width: 100%;
      }

      .progress-bar-container {
        flex: 1;
        height: 20px;
        display: flex;
        align-items: center;
        cursor: pointer;
      }

      .progress-bar-bg {
        width: 100%;
        height: 6px;
        background: #e4e4e7;
        border-radius: 3px;
        position: relative;
      }

      .progress-bar-fill {
        height: 100%;
        width: 0%;
        background: #ff9500;
        border-radius: 3px;
        position: absolute;
        left: 0;
        top: 0;
      }

      .progress-bar-knob {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #ffffff;
        border: 2px solid #ff9500;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        position: absolute;
        top: 50%;
        transform: translate(-50%, -50%);
        left: 0%;
        cursor: pointer;
      }

      .time-text {
        font-size: 14px;
        font-family: monospace;
        color: #71717a;
        white-space: nowrap;
        min-width: 80px;
        text-align: right;
        font-weight: 600;
      }

      #error {
        display: none;
        margin: 24px;
        padding: 16px;
        border-radius: 16px;
        border: 1px solid #d4d4d8;
        background: #fafafa;
        color: #991b1b;
        font-family: Arial, sans-serif;
      }

      /* Note highlight styling */
      @keyframes note-jump {
        0%, 100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-8px);
        }
      }

      .active-note {
        animation: note-jump 0.35s ease-out;
        transform-origin: center;
      }

      .active-note,
      .active-note * {
        fill: #ff9500 !important;
        stroke: #ff9500 !important;
        transition: fill 0.2s, stroke 0.2s;
      }
    </style>
  </head>
  <body>
    <div class="player-container">
      <div class="player-header">
        <div class="tempo-control">
          <div class="tempo-row">
            <label for="tempo-range">Tempo: <span id="tempo-val">120</span> BPM</label>
            <span id="detected-tempo-text" class="detected-tempo-text">Detected: 120 BPM</span>
            <button id="btn-use-original" class="orig-tempo-btn" onclick="window.useOriginalTempo()">Use Original</button>
          </div>
          <input type="range" id="tempo-range" min="30" max="300" value="120" oninput="window.setTempo(Number(this.value))">
        </div>
      </div>

      <div id="score-wrap">
        <div id="score"></div>
      </div>

      <div class="player-footer">
        <div class="timeline-row">
          <div class="progress-bar-container" onclick="window.onProgressBarClick(event)">
            <div class="progress-bar-bg">
              <div id="progress-bar-fill" class="progress-bar-fill"></div>
              <div id="progress-bar-knob" class="progress-bar-knob"></div>
            </div>
          </div>
          <div id="time-text" class="time-text">0:00 / 0:00</div>
        </div>
        
        <div class="controls-row">
          <button id="btn-restart" class="player-btn" onclick="window.restartPlayback()" title="Restart from beginning">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
            </svg>
          </button>
          <button id="btn-play" class="player-btn play-btn" onclick="window.togglePlay()" title="Play/Pause">
            <!-- Play Icon -->
            <svg id="play-icon" viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
            <!-- Pause Icon -->
            <svg id="pause-icon" viewBox="0 0 24 24" width="22" height="22" fill="currentColor" style="display: none;">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div id="error"></div>
    <div id="debug-info" style="margin: 12px; padding: 12px; border-radius: 12px; border: 2px solid #ef4444; background: #fef2f2; color: #991b1b; font-family: monospace; font-size: 11px; white-space: pre-wrap; word-break: break-all; overflow-y: auto; max-height: 200px; display: none;"></div>

    <script src="https://cdn.jsdelivr.net/npm/verovio@4.1.0/dist/verovio-toolkit-wasm.js" defer></script>
    <script>
      window.onerror = function(message, source, lineno, colno, error) {
        const debugDiv = document.getElementById('debug-info');
        if (debugDiv) {
          debugDiv.style.display = 'block';
          debugDiv.textContent += '\\\\n\\\\n=== UNHANDLED ERROR ===\\\\n' + message + ' at ' + source + ':' + lineno + ':' + colno + '\\\\n' + (error ? error.stack : '') + '\\\\n';
        }
        return false;
      };

      const sourceNotes = ${payload};
      const timeSignature = "${timeSignature}";
      const originalTempo = ${detectedTempo || 120};
      const musicxmlBase64 = "${musicxmlBase64}";

      // Normalize sourceNotes
      let playbackNotes = [];
      if (Array.isArray(sourceNotes)) {
        playbackNotes = sourceNotes;
      } else {
        playbackNotes = sourceNotes.notes || [];
      }

      // Playback state variables
      let currentNoteIndex = 0;
      let isPlaying = false;
      let tempo = Math.round(originalTempo);
      let noteStartTimestamp = 0;
      let timerId = null;
      let audioCtx = null;
      let activeOscillators = [];

      function midiToFreq(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
      }

      function initAudio() {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
      }

      function stopAllOscillators() {
        activeOscillators.forEach(osc => {
          try {
            osc.stop();
          } catch (e) {}
        });
        activeOscillators = [];
      }

      function playSingleNoteSound(freq, durationSec) {
        initAudio();
        if (!audioCtx) return;

        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.type = 'triangle'; // Piano-like warm tone
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

        const now = audioCtx.currentTime;
        gainNode.gain.setValueAtTime(0, now);
        // ADSR Envelope (lower volume per voice to prevent clipping)
        gainNode.gain.linearRampToValueAtTime(0.2, now + 0.05); // Attack
        gainNode.gain.exponentialRampToValueAtTime(0.1, now + 0.15); // Decay
        gainNode.gain.setValueAtTime(0.1, now + durationSec - 0.05); // Sustain
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + durationSec); // Release

        osc.start(now);
        osc.stop(now + durationSec);

        activeOscillators.push(osc);

        setTimeout(() => {
          const idx = activeOscillators.indexOf(osc);
          if (idx > -1) {
            activeOscillators.splice(idx, 1);
          }
        }, durationSec * 1000 + 100);
      }

      function playNextTick() {
        if (!isPlaying) return;

        if (currentNoteIndex >= playbackNotes.length) {
          isPlaying = false;
          currentNoteIndex = 0;
          stopAllOscillators();
          updatePlayButtonUI();
          highlightNote(-1);
          updateProgressUI(0);
          return;
        }

        const note = playbackNotes[currentNoteIndex];
        const durationSec = getDurationInSec(note);

        if (note && note.pitch !== 'rest') {
          const pitches = note.pitch.split(',');
          const pitchBeats = note.pitch_beats || [];
          pitches.forEach((p, pIdx) => {
            const parsed = parseNoteString(p);
            if (parsed) {
              const b = (pitchBeats[pIdx] !== undefined) ? pitchBeats[pIdx] : getNoteDurationInBeats(note);
              const pitchDurSec = b * (60.0 / tempo);
              playSingleNoteSound(midiToFreq(parsed.midi), pitchDurSec * 0.85);
            }
          });
        }

        highlightNote(currentNoteIndex);
        noteStartTimestamp = Date.now();

        timerId = setTimeout(() => {
          currentNoteIndex++;
          playNextTick();
        }, durationSec * 1000);
      }

      function getNoteDurationInBeats(note) {
        if (!note) return 1.0;
        if (note.beats !== undefined) return note.beats;
        const dur = note.duration;
        if (dur.startsWith('w')) return 4.0;
        if (dur.startsWith('h')) return dur.indexOf('d') !== -1 ? 3.0 : 2.0;
        if (dur.startsWith('q')) return dur.indexOf('d') !== -1 ? 1.5 : 1.0;
        if (dur.startsWith('8')) return dur.indexOf('d') !== -1 ? 0.75 : 0.5;
        if (dur.startsWith('16')) return 0.25;
        return 1.0;
      }

      function getDurationInSec(note) {
        return getNoteDurationInBeats(note) * (60.0 / tempo);
      }

      function getTotalDuration() {
        let totalBeats = 0.0;
        playbackNotes.forEach(note => {
          totalBeats += getNoteDurationInBeats(note);
        });
        return totalBeats * (60.0 / tempo);
      }

      function getCurrentPlaybackTime() {
        let elapsedBeforeCurrent = 0.0;
        for (let i = 0; i < currentNoteIndex; i++) {
          elapsedBeforeCurrent += getDurationInSec(playbackNotes[i]);
        }
        if (!isPlaying) {
          return elapsedBeforeCurrent;
        }
        const elapsedInNote = (Date.now() - noteStartTimestamp) / 1000;
        const currentDur = getDurationInSec(playbackNotes[currentNoteIndex]);
        return elapsedBeforeCurrent + Math.min(currentDur, elapsedInNote);
      }

      function formatTime(sec) {
        if (isNaN(sec) || sec < 0) sec = 0;
        const mins = Math.floor(sec / 60);
        const secs = Math.floor(sec % 60);
        return mins + ':' + (secs < 10 ? '0' : '') + secs;
      }

      function highlightNote(index) {
        // Clear previous highlights
        const prev = document.querySelectorAll('.active-note');
        prev.forEach(el => el.classList.remove('active-note'));

        // Highlight new note group in SVG by ID
        if (index >= 0) {
          const el = document.getElementById("n" + index);
          if (el) {
            el.classList.add('active-note');
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          }
        }
      }

      function updateProgressUI(currentTime) {
        const total = getTotalDuration();
        const progressPercent = total > 0 ? (currentTime / total) * 100 : 0;
        
        const fill = document.getElementById('progress-bar-fill');
        const knob = document.getElementById('progress-bar-knob');
        const timeText = document.getElementById('time-text');
        
        if (fill) fill.style.width = progressPercent + '%';
        if (knob) knob.style.left = progressPercent + '%';
        if (timeText) timeText.textContent = formatTime(currentTime) + ' / ' + formatTime(total);
      }

      function runProgressAnimation() {
        if (!isPlaying) return;
        updateProgressUI(getCurrentPlaybackTime());
        requestAnimationFrame(runProgressAnimation);
      }

      window.togglePlay = function() {
        initAudio();
        if (isPlaying) {
          pausePlayback();
        } else {
          startPlayback();
        }
      };

      function startPlayback() {
        if (isPlaying) return;
        isPlaying = true;
        updatePlayButtonUI();
        
        if (currentNoteIndex >= playbackNotes.length) {
          currentNoteIndex = 0;
        }
        
        runProgressAnimation();
        playNextTick();
      }

      function pausePlayback() {
        if (!isPlaying) return;
        isPlaying = false;
        updatePlayButtonUI();
        stopAllOscillators();
        if (timerId) {
          clearTimeout(timerId);
          timerId = null;
        }
      }

      window.restartPlayback = function() {
        const wasPlaying = isPlaying;
        pausePlayback();
        currentNoteIndex = 0;
        highlightNote(-1);
        updateProgressUI(0);
        if (wasPlaying || true) {
          startPlayback();
        }
      };

      window.onProgressBarClick = function(event) {
        if (playbackNotes.length === 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, clickX / rect.width));
        
        const totalDur = getTotalDuration();
        const targetTime = ratio * totalDur;
        
        let accumulatedTime = 0.0;
        let targetIndex = 0;
        for (let i = 0; i < playbackNotes.length; i++) {
          const noteDur = getDurationInSec(playbackNotes[i]);
          if (accumulatedTime + noteDur > targetTime) {
            targetIndex = i;
            break;
          }
          accumulatedTime += noteDur;
          targetIndex = i;
        }
        
        const wasPlaying = isPlaying;
        pausePlayback();
        
        currentNoteIndex = targetIndex;
        highlightNote(currentNoteIndex);
        updateProgressUI(accumulatedTime);
        
        if (wasPlaying) {
          startPlayback();
        }
      };

      window.setTempo = function(newTempo) {
        const wasPlaying = isPlaying;
        if (isPlaying) {
          pausePlayback();
        }
        tempo = newTempo;
        const label = document.getElementById('tempo-val');
        if (label) label.textContent = Math.round(newTempo);
        
        let accumulatedTime = 0.0;
        for (let i = 0; i < currentNoteIndex; i++) {
          accumulatedTime += getDurationInSec(playbackNotes[i]);
        }
        updateProgressUI(accumulatedTime);
        if (wasPlaying) {
          startPlayback();
        }
      };

      window.useOriginalTempo = function() {
        window.setTempo(originalTempo);
        const slider = document.getElementById('tempo-range');
        if (slider) slider.value = Math.round(originalTempo);
      };

      function updatePlayButtonUI() {
        const playIcon = document.getElementById('play-icon');
        const pauseIcon = document.getElementById('pause-icon');
        if (isPlaying) {
          if (playIcon) playIcon.style.display = 'none';
          if (pauseIcon) pauseIcon.style.display = 'block';
        } else {
          if (playIcon) playIcon.style.display = 'block';
          if (pauseIcon) pauseIcon.style.display = 'none';
        }
      }

      function parseNoteString(noteStr) {
        const normalized = noteStr.trim();
        const match = normalized.match(/^([A-Ga-g])([#b]?)(-\\\\d+|\\\\d+)?$/);
        if (!match) return null;
        const letter = match[1].toLowerCase();
        const accidental = match[2] || '';
        const octave = match[3] !== undefined ? Number(match[3]) : 4;
        
        const offsets = { c:0, 'c#':1, db:1, d:2, 'd#':3, eb:3, e:4, f:5, 'f#':6, gb:6, g:7, 'g#':8, ab:8, a:9, 'a#':10, bb:10, b:11 };
        const keyName = match[1].toLowerCase() + accidental;
        const offset = offsets[keyName] || 0;
        const midi = (octave + 1) * 12 + offset;
        
        return { letter, accidental, octave, midi };
      }

      function showError(message) {
        const error = document.getElementById('error');
        const score = document.getElementById('score');
        score.innerHTML = '';
        error.style.display = 'block';
        error.textContent = message;
      }

      let vrvToolkit = null;

      function renderScore() {
        console.log("ACTIVE RENDERSCORE FILE");
        console.log("ACTIVE RENDERSCORE FILE: backend/update_sheet_shared.py");
        try {
          if (typeof verovio === 'undefined') {
            throw new Error('Verovio WebAssembly toolkit failed to initialize.');
          }
          if (!vrvToolkit) {
            vrvToolkit = new verovio.toolkit();
          }

          vrvToolkit.setOptions({
            pageWidth: Math.round(window.innerWidth * 7),
            pageHeight: 20000,
            scale: 30,
            adjustPageHeight: true,
            breaks: 'none',
            openGits: true
          });

          const musicxml = atob(musicxmlBase64);
          if (!musicxml) {
            showError("No MusicXML score data provided.");
            return;
          }

          vrvToolkit.loadData(musicxml);
          const svg = vrvToolkit.renderToPage(1);

          const scoreRoot = document.getElementById('score');
          scoreRoot.innerHTML = svg;

          const scoreSvg = scoreRoot.querySelector('svg');
          if (scoreSvg) {
            scoreSvg.style.width = '100%';
            scoreSvg.style.height = 'auto';
          }

          updateProgressUI(0);
          const roundedOriginal = Math.round(originalTempo);
          const detectedText = document.getElementById('detected-tempo-text');
          if (detectedText) detectedText.textContent = 'Detected: ' + roundedOriginal + ' BPM';

          const slider = document.getElementById('tempo-range');
          if (slider) slider.value = roundedOriginal;

          const valLabel = document.getElementById('tempo-val');
          if (valLabel) valLabel.textContent = roundedOriginal;

        } catch (error) {
          showError(error.message);
        }
      }

      function initAndRender() {
        if (typeof verovio !== 'undefined' && verovio.module) {
          verovio.module.onRuntimeInitialized = () => {
            renderScore();
          };
          if (verovio.module.calledRun) {
            renderScore();
          }
        } else {
          let retries = 0;
          const interval = setInterval(() => {
            if (typeof verovio !== 'undefined' && verovio.module) {
              clearInterval(interval);
              verovio.module.onRuntimeInitialized = () => {
                renderScore();
              };
              if (verovio.module.calledRun) {
                renderScore();
              }
            } else {
              retries++;
              if (retries > 120) {
                clearInterval(interval);
                showError('Verovio script failed to load (timeout).');
              }
            }
          }, 50);
        }
      }

      if (document.readyState === 'complete') {
        initAndRender();
      } else {
        window.addEventListener('load', initAndRender);
      }
    </script>
  </body>
</html>`;
}
"""

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content[:idx] + new_code)
print("Updated sheetMusicShared.ts successfully!")
