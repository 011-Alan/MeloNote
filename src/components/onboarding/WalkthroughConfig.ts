export interface WalkthroughStep {
  id: string;
  route: string;
  title: string;
  description: string;
  highlightId?: string;
  tooltipPosition: 'top' | 'bottom' | 'center';
}

export const WalkthroughSteps: WalkthroughStep[] = [
  {
    id: 'home',
    route: '/',
    title: '🏠 Welcome to MeloNote',
    description: 'Your intelligent music workspace.',
    tooltipPosition: 'center',
  },
  {
    id: 'audio-to-sheet',
    route: '/',
    title: '🎤 Audio to Sheet Music',
    description: 'Record or import audio — MeloNote converts it into editable sheet music.',
    tooltipPosition: 'bottom',
    highlightId: 'action-record',
  },
  {
    id: 'compose',
    route: '/',
    title: '✍️ Compose Music',
    description: 'Start with a blank sheet and compose manually from scratch.',
    tooltipPosition: 'bottom',
    highlightId: 'action-compose',
  },
  {
    id: 'scan',
    route: '/',
    title: '📄 Scan Sheet Music',
    description: 'Photograph printed sheet music and convert it to editable notation instantly.',
    tooltipPosition: 'bottom',
    highlightId: 'action-scan',
  },
  {
    id: 'record-page',
    route: '/record',
    title: '🎙️ Record & Transcribe',
    description: 'Record audio directly or import a file and let AI transcribe it into a music score.',
    tooltipPosition: 'bottom',
    highlightId: 'record-btn',
  },
  {
    id: 'scan-page',
    route: '/scan',
    title: '📸 Scan Your Music',
    description: 'Point your camera at a printed score and MeloNote will digitise it for editing and playback.',
    tooltipPosition: 'bottom',
    highlightId: 'scan-camera',
  },
  {
    id: 'projects',
    route: '/projects',
    title: '📂 Your Projects',
    description: 'All your saved compositions live here. Tap any to open, continue editing, or export.',
    tooltipPosition: 'bottom',
    highlightId: 'projects-list',
  },
  {
    id: 'edit-mode',
    route: '/create',
    title: '✍️ Edit Mode',
    description: 'Select measures, add or delete notes, adjust tempo, and export your score.',
    tooltipPosition: 'bottom',
    highlightId: 'edit-sidebar',
  },
  {
    id: 'playback',
    route: '/create',
    title: '▶️ Playback',
    description: 'Play back your score with synthesised audio, adjust volume and tempo in real time.',
    tooltipPosition: 'top',
    highlightId: 'playback-panel',
  },
  {
    id: 'settings',
    route: '/settings',
    title: '⚙️ Settings',
    description: 'Customise your theme, notification preferences, and volume.',
    tooltipPosition: 'bottom',
    highlightId: 'settings-theme',
  },
];
