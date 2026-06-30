// test_gen_html.ts
import * as fs from 'fs';
import { buildSheetMusicHtml, parseSheetNotes } from './src/components/sheetMusicShared.ts';

const sampleNotes = [
  { pitch: 'Bb1,Bb2,F3,F4,D5', duration: '8', beats: 0.5 },
  { pitch: 'Bb2,F3', duration: '8', beats: 0.5 },
  { pitch: 'rest', duration: '16r', beats: 0.25 }
];

const { parsedNotes } = parseSheetNotes(sampleNotes);
const html = buildSheetMusicHtml(parsedNotes, '2/4', 93);
fs.writeFileSync('temp_generated_score.html', html);
console.log('HTML written successfully.');
