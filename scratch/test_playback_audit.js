const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// 1. Load project data.json
const dataPath = 'c:\\ReactNative\\music-app\\MeloNote\\backend\\projects\\4320b7df-0892-470f-95ce-18d54a9646ba\\data.json';
const project = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// 2. Load compiled sheetMusicShared.js
const sheetMusicShared = require('../temp_build/sheetMusicShared.js');

// 3. Prepare notes and arguments
const notes = project.notes || [];
const timeSignature = project.time_signature || '4/4';
const tempo = project.detected_tempo || 120;
const musicxml = project.musicxml;

console.log("Found notes count in project:", notes.length);
console.log("Time Signature:", timeSignature);
console.log("Detected Tempo:", tempo);
console.log("MusicXML length:", musicxml ? musicxml.length : 0);

// Generate HTML with real project MusicXML
const html = sheetMusicShared.buildSheetMusicHtml(
  notes,
  timeSignature,
  tempo,
  musicxml,
  '', // selectedNoteId
  null, // selectedMeasureIndex
  null, // selectedBarId
  [], // selectedNoteIds
  true, // editable
  2 // measuresPerSystemVal
);

const htmlPath = path.join(__dirname, 'temp_generated_score_real.html');
fs.writeFileSync(htmlPath, html);
console.log('HTML written successfully to temp_generated_score_real.html.');

// 4. Set up JSDOM to load and run
const dom = new JSDOM(html, {
  resources: 'usable',
  runScripts: 'dangerously',
  pretendToBeVisual: true
});

// Mock AudioContext
class MockAudioContext {
  constructor() {
    this.state = 'suspended';
    this.currentTime = 0;
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  createOscillator() {
    return {
      connect: () => {},
      frequency: {
        setValueAtTime: (freq, time) => {
          console.log('[Mock Oscillator] Set frequency to', freq, 'at time', time);
        }
      },
      type: 'triangle',
      start: (time) => {
        console.log('[Mock Oscillator] Started at time', time);
      },
      stop: (time) => {
        console.log('[Mock Oscillator] Stopped at time', time);
      }
    };
  }
  createGain() {
    return {
      connect: () => {},
      gain: {
        setValueAtTime: (val, time) => {
          console.log('[Mock Gain] Set value to', val, 'at time', time);
        },
        linearRampToValueAtTime: (val, time) => {
          console.log('[Mock Gain] Linear ramp to value', val, 'at time', time);
        },
        exponentialRampToValueAtTime: (val, time) => {
          console.log('[Mock Gain] Exponential ramp to value', val, 'at time', time);
        }
      }
    };
  }
  get destination() {
    return {};
  }
}

dom.window.AudioContext = MockAudioContext;
dom.window.webkitAudioContext = MockAudioContext;

// Capture logs and prefix them
dom.window.console.log = (...args) => {
  console.log('[WebView Log]', ...args);
};
dom.window.console.warn = (...args) => {
  console.warn('[WebView Warn]', ...args);
};
dom.window.console.error = (...args) => {
  console.error('[WebView Error]', ...args);
};

console.log('JSDOM started, waiting 15 seconds to let Verovio load, parse MusicXML, build playback schedule and trigger audit logs...');

setTimeout(() => {
  const document = dom.window.document;
  console.log('Total notes rendered in SVG:', document.querySelectorAll('.note').length);
  
  // Now let's simulate clicking Play to test transport start and synthesizer events!
  console.log('\n--- SIMULATING TRANSPORT START (PLAY CLICK) ---');
  if (typeof dom.window.togglePlay === 'function') {
    dom.window.togglePlay();
  } else {
    console.error('togglePlay is not defined on WebView window!');
  }
  
  // Wait another 5 seconds for play ticks/synth events to fire
  setTimeout(() => {
    console.log('Simulation complete.');
    process.exit(0);
  }, 5000);
}, 15000);
