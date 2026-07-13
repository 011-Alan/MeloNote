export interface EducationalTip {
  category: 'Music Facts' | 'Music Notation Facts' | 'MeloNote Tips' | 'Transcription Tips' | 'Editing Tips';
  text: string;
}

export const EDUCATIONAL_TIPS: EducationalTip[] = [
  // Music Facts
  { category: 'Music Facts', text: 'The piano has 88 keys in total: 52 white keys and 36 black keys.' },
  { category: 'Music Facts', text: 'Ludwig van Beethoven continued to compose masterpiece symphonies even after losing his hearing completely.' },
  { category: 'Music Facts', text: 'The oldest known written musical notation dates back over 3,000 years to a Hurrian hymn found in Ugarit.' },
  { category: 'Music Facts', text: 'Middle C (C4) is shared between both the treble and bass clefs on the grand staff.' },
  { category: 'Music Facts', text: 'Sound travels about 4 times faster in water than it does in the air.' },
  { category: 'Music Facts', text: 'The world\'s longest running musical performance is playing in Germany and is planned to last 639 years.' },
  { category: 'Music Facts', text: 'Mozart wrote his first symphony when he was just eight years old.' },
  { category: 'Music Facts', text: 'A standard violin has four strings, traditionally tuned to the notes G, D, A, and E.' },

  // Music Notation Facts
  { category: 'Music Notation Facts', text: 'Accidentals (sharps, flats, and naturals) only affect notes within the current measure unless tied.' },
  { category: 'Music Notation Facts', text: 'Ledger lines extend the staff above or below the standard five lines for very high or low notes.' },
  { category: 'Music Notation Facts', text: 'A dot placed after a note increases its duration by exactly half of its original value.' },
  { category: 'Music Notation Facts', text: 'Time signatures define the rhythmic structure by showing beats per measure and which note gets the beat.' },
  { category: 'Music Notation Facts', text: 'A tie joins the duration of two notes of the same pitch, merging them into a single sound.' },
  { category: 'Music Notation Facts', text: 'A slur connects notes of different pitches to indicate they should be played smoothly (legato).' },
  { category: 'Music Notation Facts', text: 'The treble clef is also known as the G clef because its loop wraps around the G line of the staff.' },
  { category: 'Music Notation Facts', text: 'The bass clef is also known as the F clef because its two dots surround the F line of the staff.' },

  // MeloNote Tips
  { category: 'MeloNote Tips', text: 'You can edit any generated music sheet by tapping the Compose button or opening it from Projects.' },
  { category: 'MeloNote Tips', text: 'Long press notes inside the editor to edit their pitch, duration, or delete them.' },
  { category: 'MeloNote Tips', text: 'Use the Undo and Redo buttons on the top right to easily fix mistakes while composing.' },
  { category: 'MeloNote Tips', text: 'Export your completed score as a high-quality PDF to print or share with friends.' },
  { category: 'MeloNote Tips', text: 'Switch between Original Audio and Sheet Synth in the playback panel to compare transcription results.' },
  { category: 'MeloNote Tips', text: 'Change the playback tempo anytime in the editor to hear your composition faster or slower.' },
  { category: 'MeloNote Tips', text: 'Save your projects in the cloud or local storage to continue editing them later.' },
  { category: 'MeloNote Tips', text: 'Create music manually from scratch by pressing the "+" Compose tab in the bottom bar.' },

  // Transcription Tips
  { category: 'Transcription Tips', text: 'Clear and clean recordings improve transcription accuracy significantly.' },
  { category: 'Transcription Tips', text: 'Reduce background noise and echoes before recording to help the AI isolate your instrument.' },
  { category: 'Transcription Tips', text: 'Single instrument recordings (especially solo piano) produce the highest-quality results.' },
  { category: 'Transcription Tips', text: 'Keep the microphone close to the sound source, but not too close to avoid clipping.' },
  { category: 'Transcription Tips', text: 'Avoid singing or speaking during the recording to keep the notation clean.' },
  { category: 'Transcription Tips', text: 'Play at a consistent tempo to help the AI detect the correct time signature and grid.' },
  { category: 'Transcription Tips', text: 'Tuning your instrument to standard A440 Hz before recording ensures accurate pitch detection.' },
  { category: 'Transcription Tips', text: 'Avoid heavy room reverb or digital delay effects on your recordings for cleaner notes.' },

  // Editing Tips
  { category: 'Editing Tips', text: 'Tap a measure to highlight it and begin editing in the notation editor.' },
  { category: 'Editing Tips', text: 'Use the "+" icon to insert new notes or rests at the cursor position.' },
  { category: 'Editing Tips', text: 'Delete notes by selecting them and tapping the trash or delete icon in Edit Mode.' },
  { category: 'Editing Tips', text: 'Add connecting beams between adjacent eighth or sixteenth notes to clean up notation.' },
  { category: 'Editing Tips', text: 'Insert additional staffs to create multi-instrument arrangements or grand staff systems.' },
  { category: 'Editing Tips', text: 'Add extra measures at the end of the sheet when your composition grows.' },
  { category: 'Editing Tips', text: 'Select multiple notes together to form vertical chords inside the staff.' },
  { category: 'Editing Tips', text: 'Use the sidebar panel in Edit Mode to toggle volume dynamics and expressive markings.' }
];
