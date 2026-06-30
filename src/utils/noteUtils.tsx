const NOTES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];

export function frequencyToNote(
  frequency: number
) {
  if (frequency <= 0) {
    return 'Unknown';
  }

  const noteNumber =
    12 *
      Math.log2(
        frequency / 440
      ) +
    69;

  const rounded =
    Math.round(noteNumber);

  const noteName =
    NOTES[rounded % 12];

  const octave =
    Math.floor(
      rounded / 12
    ) - 1;

  return `${noteName}${octave}`;
}