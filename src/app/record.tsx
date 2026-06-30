import { useState, useEffect, useRef, useCallback } from 'react';

import CreateScreen from './create';
import TranscriptionQualityCard, { QualityScores } from '@/components/TranscriptionQualityCard';
import PlaybackController from '@/components/PlaybackController';
import MusicLoadingAnimation from '@/components/MusicLoadingAnimation';
import { GradientBackground, GlassCard, PrimaryButton, SecondaryButton, LoadingAnimation } from '@/components/ui/DesignSystem';

import {
  View,
  Pressable,
  ScrollView,
  Text,
  Alert,
  Platform,
  ActivityIndicator,
  Share,
  Switch,
  Modal,
  StyleSheet
} from 'react-native';

import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
  useAudioPlayer,
} from 'expo-audio';

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { File as ExpoFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';

import { Ionicons } from '@expo/vector-icons';

import { LinearGradient } from 'expo-linear-gradient';

// Module-level cache to persist Record screen state across tab switching (unmounts)
let lastActiveRecordState: any = null;

export default function RecordScreen() {
  const params = useLocalSearchParams<{ loadProjectId?: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const webViewRef = useRef<any>(null);

  const BACKEND_URL = 'http://192.168.1.4:5000';

  const [projectId, setProjectId] = useState<string | null>(null);
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);

  const recorder = useAudioRecorder(
    RecordingPresets.HIGH_QUALITY
  );

  const [removeModalVisible, setRemoveModalVisible] =
  useState(false);

  const [recordingURI, setRecordingURI] =
    useState('');

  const [isRecording, setIsRecording] =
    useState(false);

  const [isPlaying, setIsPlaying] =
    useState(false);

  const [seconds, setSeconds] = useState(0);

  const [currentTime, setCurrentTime] =
    useState(0);

  const [duration, setDuration] =
    useState(0);

  const [progressBarWidth, setProgressBarWidth] = useState(0);

  const [audioInfo, setAudioInfo] =
    useState({
      name: '',
      size: 0,
    });

  const [nativeAudioFile, setNativeAudioFile] =
    useState<ExpoFile | null>(null);

  const [
    convertedNotes,
    setConvertedNotes
  ] = useState<any>([]);

  const [
    showSheet,
    setShowSheet
  ] = useState(false);

  const [isConverting, setIsConverting] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [showRecordAnotherModal, setShowRecordAnotherModal] = useState(false);
  const isDiscardedRef = useRef(false);
  const [timeSignature, setTimeSignature] = useState('4/4');
  const [detectedTempo, setDetectedTempo] = useState<number | null>(null);
  const [musicXML, setMusicXML] = useState('');
  const [qualityScores, setQualityScores] = useState<QualityScores | null>(null);
  const [monophonic, setMonophonic] = useState(false);
  const [rawNoteEvents, setRawNoteEvents] = useState<any[]>([]);
  const [cameFromProjects, setCameFromProjects] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<'notation' | 'original'>('notation');
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const wasPlayingBeforeDragRef = useRef(false);
  const isDraggingRef = useRef(false);
  const progressShared = useSharedValue(0);
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  // High-frequency ref that always holds the latest native player currentTime.
  // player.currentTime on Android is stale by up to the native update interval.
  // We update this every 100ms during playback so pause/seek captures exact position.
  const playerCurrentTimeRef = useRef(0);
  const originalDurationRef = useRef(0);
  const playbackModeRef = useRef(playbackMode);
  playbackModeRef.current = playbackMode;
  const showSheetRef = useRef(showSheet);
  showSheetRef.current = showSheet;
  // Synchronously-updated ref so the 100ms ticker can stop updating currentTime
  // the instant pause is initiated — before React re-renders to clean up the interval.
  const isPlayingRef = useRef(false);
  const isModeSwitchingRef = useRef(false);
  const modeSwitchingTimeRef = useRef<number | null>(null);
  const pendingPlayAfterUnlockRef = useRef(false);

  // const audioSource = (playbackMode === 'original' || !showSheet)
  //   ? recordingURI
  //   : (projectId && showSheet ? `${BACKEND_URL}/export/wav/${projectId}` : '');
  //const player = useAudioPlayer(recordingURI);
  const player = useAudioPlayer(recordingURI);

  useEffect(() => {
    let interval: any;

    if (isRecording) {
      interval = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isRecording]);

  // Pause playback when the user navigates away from the record screen
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      if (isPlaying) {
        setIsPlaying(false);
        stopEqualizerAnimation();
        const isOriginalMode = playbackModeRef.current === 'original' || !showSheetRef.current;
        if (isOriginalMode) {
          const exactTime = playerCurrentTimeRef.current;
          // Synchronously block ticker before pause, same as in playRecording()
          isPlayingRef.current = false;
          player.pause();
          const resolvedTime = exactTime > 0 ? exactTime : currentTime;
          playerCurrentTimeRef.current = resolvedTime;
          setCurrentTime(resolvedTime);
        } else {
          const msg = { type: 'PAUSE' };
          if (Platform.OS === 'web') {
            const iframe = document.getElementById('record-sheet-music-iframe') as HTMLIFrameElement;
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage(JSON.stringify(msg), '*');
            }
          } else {
            if (webViewRef.current) {
              webViewRef.current.postMessage(JSON.stringify(msg));
            }
          }
        }
      }
    });
    return unsubscribe;
  }, [navigation, isPlaying, player]);

  // Sync equalizer animation with isPlaying state
  useEffect(() => {
    if (isPlaying) {
      startEqualizerAnimation();
    } else {
      stopEqualizerAnimation();
    }
  }, [isPlaying]);

  // Audio player duration setup for original audio mode
  // Audio player duration setup
  useEffect(() => {
    if (!player) return;
    const interval = setInterval(() => {
      if (player.duration && player.duration > 0) {
        originalDurationRef.current = player.duration;
        const isOriginalMode = playbackMode === 'original' || !showSheet;
        if (isOriginalMode) {
          setDuration(player.duration);
        }
        clearInterval(interval);
      }
    }, 300);
    return () => clearInterval(interval);
  }, [player, playbackMode, showSheet]);

  // Update displayed duration when speed changes in original mode
  useEffect(() => {
    const isOriginalMode = playbackMode === 'original' || !showSheet;
    if (isOriginalMode && originalDurationRef.current > 0) {
      setDuration(originalDurationRef.current);
    }
  }, [playbackMode, showSheet]);

  useEffect(() => {
    const isOriginalMode = playbackMode === 'original' || !showSheet;
    if (isOriginalMode) {
      if (player) {
        player.shouldCorrectPitch = true;
        (player as any).pitchCorrectionQuality = 'high';
        player.setPlaybackRate(1.0, 'high');
      }
      const msg = { type: 'SET_SPEED', rate: 1.0 };
      if (Platform.OS === 'web') {
        const iframe = document.getElementById('record-sheet-music-iframe') as HTMLIFrameElement;
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage(JSON.stringify(msg), '*');
        }
      } else if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify(msg));
      }
    }
  }, [player, playbackMode, showSheet]);

  // Send HIGHLIGHT_NOTE to WebView when currentTime changes in original playback mode
  useEffect(() => {
    const isOriginalMode = playbackMode === 'original' || !showSheet;
    if (isOriginalMode) {
      const msg = { type: 'HIGHLIGHT_NOTE', time: currentTime };
      if (Platform.OS === 'web') {
        const iframe = document.getElementById('record-sheet-music-iframe') as HTMLIFrameElement;
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage(JSON.stringify(msg), '*');
        }
      } else if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify(msg));
      }
    }
  }, [currentTime, playbackMode, showSheet]);

  // Playback timer ticker for original audio mode.
  // Runs at 100ms to keep playerCurrentTimeRef fresh with sub-second precision.
  useEffect(() => {
    let interval: any;
    const isOriginalMode = playbackMode === 'original' || !showSheet;
    if (isPlaying && isOriginalMode && player) {
      interval = setInterval(() => {
        // isPlayingRef is set to false synchronously when pause is initiated,
        // so this guard prevents the post-pause tick from overwriting the
        // captured pause position with a stale/integer native value.
        if (!isPlayingRef.current) return;
        if (player.currentTime !== undefined && player.duration) {
          originalDurationRef.current = player.duration;
          const curUnscaled = player.currentTime;
          const durUnscaled = player.duration;
          const curScaled = curUnscaled;
          const durScaled = durUnscaled;
          
          playerCurrentTimeRef.current = curScaled;
          setCurrentTime(curScaled);
          setDuration(durScaled);
          
          console.log('[RECORD TICKER] player.currentTime =', curUnscaled.toFixed(6), '| playerCurrentTimeRef =', playerCurrentTimeRef.current.toFixed(6));
          if (curUnscaled >= durUnscaled - 0.05) {
            clearInterval(interval);
            isPlayingRef.current = false;
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
  }, [isPlaying, playbackMode, showSheet, player]);

  // Position-tracking playhead animation.
  // Fires on every currentTime change:
  //   - Original audio: every 100ms from the native ticker
  //   - Sheet music: every ~250ms from WebView PLAYBACK_PROGRESS messages
  // Uses a short withTiming so the knob glides smoothly between positions,
  // making both modes look identical and always in sync with actual audio.
  useEffect(() => {
    if (isDraggingRef.current || duration <= 0) return;

    const isOriginalMode = playbackMode === 'original' || !showSheet;
    const targetPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));

    if (isPlaying) {
      progressShared.value = targetPercent;
    } else {
      // Paused/stopped: cancel any running animation and snap to exact position
      cancelAnimation(progressShared);
      progressShared.value = targetPercent;
    }
  }, [isPlaying, currentTime, duration, playbackMode, showSheet]);


  // Effect to load project when navigated from Projects screen
  useEffect(() => {
    async function loadProject() {
      if (params.loadProjectId) {
        try {
          if (Platform.OS === 'web') {
            const projectJson = localStorage.getItem('melo_project_' + params.loadProjectId);
            if (projectJson) {
              const project = JSON.parse(projectJson);
              setRecordingURI(project.recordingURI || '');
              setConvertedNotes(project.convertedNotes || []);
              setRawNoteEvents(project.rawNoteEvents || []);
              setMusicXML(project.musicXML || '');
              setTimeSignature(project.timeSignature || '4/4');
              setDetectedTempo(project.detectedTempo || 120);
              setQualityScores(project.qualityScores || null);
              setAudioInfo({
                name: project.name || 'Project Name',
                size: project.audioSize || 0,
              });
              setDuration(project.duration || 0);
              setProjectId(project.id || null);
              setCameFromProjects(true);
              setShowSheet(true);
              router.setParams({ loadProjectId: undefined });
            } else {
              Alert.alert('Error', 'Project not found in local storage.');
            }
            return;
          }

          const projectFileUri = `${FileSystem.documentDirectory}projects/${params.loadProjectId}.json`;
          const fileInfo = await FileSystem.getInfoAsync(projectFileUri);
          
          if (fileInfo.exists) {
            const projectJson = await FileSystem.readAsStringAsync(projectFileUri);
            const project = JSON.parse(projectJson);
            
            setRecordingURI(project.recordingURI || '');
            setConvertedNotes(project.convertedNotes || []);
            setRawNoteEvents(project.rawNoteEvents || []);
            setMusicXML(project.musicXML || '');
            setTimeSignature(project.timeSignature || '4/4');
            setDetectedTempo(project.detectedTempo || 120);
            setQualityScores(project.qualityScores || null);
            setAudioInfo({
              name: project.name || 'Project Name',
              size: project.audioSize || 0,
            });
            setDuration(project.duration || 0);
            setProjectId(project.id || null);
            setCameFromProjects(true);
            setShowSheet(true);
            
            // Clear route params so it doesn't reload on every mount/refresh
            router.setParams({ loadProjectId: undefined });
          } else {
            Alert.alert('Error', 'Project file does not exist.');
          }
        } catch (err) {
          console.error('[loadProject] Error:', err);
          Alert.alert('Error', 'Could not load the project.');
        }
      }
    }
    loadProject();
  }, [params.loadProjectId]);


  // Restore active record session state on mount/focus if it exists and we're not loading a new project
  useEffect(() => {
    if (lastActiveRecordState && !params.loadProjectId) {
      const state = lastActiveRecordState;
      setRecordingURI(state.recordingURI || '');
      setConvertedNotes(state.convertedNotes || []);
      setRawNoteEvents(state.rawNoteEvents || []);
      setMusicXML(state.musicXML || '');
      setTimeSignature(state.timeSignature || '4/4');
      setDetectedTempo(state.detectedTempo || null);
      setQualityScores(state.qualityScores || null);
      setAudioInfo(state.audioInfo || { name: '', size: 0 });
      setDuration(state.duration || 0);
      setProjectId(state.projectId || null);
      setCameFromProjects(state.cameFromProjects || false);
      setShowSheet(state.showSheet || false);
      setPlaybackMode(state.playbackMode || 'notation');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save/clear active record session state in module-level cache
  useEffect(() => {
    if (cameFromProjects) {
      lastActiveRecordState = null;
    } else if (recordingURI || showSheet) {
      lastActiveRecordState = {
        recordingURI,
        convertedNotes,
        rawNoteEvents,
        musicXML,
        timeSignature,
        detectedTempo,
        qualityScores,
        audioInfo,
        duration,
        projectId,
        cameFromProjects,
        showSheet,
        playbackMode,
      };
    } else {
      lastActiveRecordState = null;
    }
  }, [
    recordingURI,
    convertedNotes,
    rawNoteEvents,
    musicXML,
    timeSignature,
    detectedTempo,
    qualityScores,
    audioInfo,
    duration,
    projectId,
    cameFromProjects,
    showSheet,
    playbackMode,
  ]);

  const bar1 = useSharedValue(15);

  const bar2 = useSharedValue(30);

  const bar3 = useSharedValue(20);


  const bar1Style = useAnimatedStyle(() => {
    return {
      height: bar1.value,
    };
  });

  const bar2Style = useAnimatedStyle(() => {
    return {
      height: bar2.value,
    };
  });

  const bar3Style = useAnimatedStyle(() => {
    return {
      height: bar3.value,
    };
  });



  function resetConvertedSheet() {
    setRecordingURI('');
    setAudioInfo({
      name: '',
      size: 0,
    });
    setNativeAudioFile(null);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setConvertedNotes([]);
    setRawNoteEvents([]);
    setMusicXML('');
    setShowSheet(false);
    setDetectedTempo(null);
    setQualityScores(null);
    setProjectId(null);
    setCameFromProjects(false);
  }
  function performRemove() {
    setRecordingURI('');
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setAudioInfo({
      name: '',
      size: 0,
    });
    setNativeAudioFile(null);
    resetConvertedSheet();
    stopEqualizerAnimation();
  }

  function resetRecordWorkflow() {
    try {
      player.pause();
      player.seekTo(0);
    } catch (e) {
      console.warn('Error resetting player:', e);
    }
    playerCurrentTimeRef.current = 0;
    lastActiveRecordState = null;
    performRemove();
    setShowSheet(false);
  }

  function removeAudio() {
    if (Platform.OS === 'web') {
      setRemoveModalVisible(true);
  } else {
      Alert.alert(
        'Remove Audio',
        'Are you sure you want to remove this audio?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Yes',
            onPress: performRemove,
          },
        ]
      );
    }
  }


  async function convertAudio() {
    try {
      console.log('Convert pressed');

      if (!recordingURI) {
        console.log('No audio selected');
        return;
      }

      isDiscardedRef.current = false;
      setIsConverting(true);

      const uriFileName =
        recordingURI
          .split('/')
          .pop()
          ?.split('?')[0];

      const fileName =
        audioInfo?.name?.includes('.')
          ? audioInfo.name
          : uriFileName ||
            audioInfo?.name ||
            'audio.mp3';

      let mimeType = 'audio/mpeg';

      if (
        fileName
          .toLowerCase()
          .endsWith('.wav')
      ) {
        mimeType = 'audio/wav';
      } else if (
        fileName
          .toLowerCase()
          .endsWith('.m4a')
      ) {
        mimeType = 'audio/mp4';
      }

      console.log('URI:', recordingURI);
      console.log('File:', fileName);
      console.log('Type:', mimeType);

      let data: any;

      if (Platform.OS === 'web') {
        const formData = new FormData();
        const audioResponse = await fetch(recordingURI);
        const audioBlob = await audioResponse.blob();
        formData.append('audio', audioBlob, fileName);
        formData.append('monophonic', String(monophonic));

        console.log('Sending request (Web)...');
        const response = await fetch(
          `${BACKEND_URL}/analyze`,
          {
            method: 'POST',
            body: formData,
          }
        );

        console.log('Status:', response.status);
        if (isDiscardedRef.current) return;

        data = await response.json();
        if (isDiscardedRef.current) return;
      } else {
        // Native platforms (Android/iOS): use raw XMLHttpRequest to bypass Expo's scoped fetch polyfill.
        // This avoids sandbox directory-scoping checks on Android that block FileSystem reads.
        const fileURI = nativeAudioFile ? nativeAudioFile.uri : recordingURI;
        console.log('[Native Debug] Uploading via XHR:', fileURI);
        
        data = await new Promise<any>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `${BACKEND_URL}/analyze`);

          xhr.onload = () => {
            console.log('[Native Debug] XHR Status:', xhr.status);
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const responseData = JSON.parse(xhr.responseText);
                resolve(responseData);
              } catch (e) {
                reject(new Error(`Failed to parse server response: ${xhr.responseText}`));
              }
            } else {
              // Log the full Python traceback if the server sent one
              try {
                const errBody = JSON.parse(xhr.responseText);
                if (errBody.traceback) {
                  console.log('[Backend Traceback]\n' + errBody.traceback);
                }
                reject(new Error(`Server returned status: ${xhr.status}. Message: ${errBody.message || xhr.responseText}`));
              } catch (_) {
                reject(new Error(`Server returned status: ${xhr.status}. Response: ${xhr.responseText}`));
              }
            }
          };

          xhr.onerror = () => {
            reject(new Error('Network request failed'));
          };

          const nativeFormData = new FormData();
          nativeFormData.append('audio', {
            uri: fileURI,
            type: mimeType,
            name: fileName
          } as any);
          nativeFormData.append('monophonic', String(monophonic));

          console.log('[Native Debug] Sending XHR request...');
          xhr.send(nativeFormData);
        });

        if (isDiscardedRef.current) return;
      }

      console.log('Server Response:', JSON.stringify({
        detected_tempo: data.detected_tempo,
        notes: data.notes,
        success: data.success,
        time_signature: data.time_signature
      }));
      if (isDiscardedRef.current) return;

      if (
        data.success &&
        Array.isArray(data.notes) &&
        data.notes.length > 0
      ) {
        setTimeSignature(data.time_signature || '4/4');
        setDetectedTempo(data.detected_tempo || 120);
        if (data.musicxml) {
          setMusicXML(data.musicxml);
        }
        
        const rawScores = data.quality_scores || data.qualityScores;
        let scoresObj = null;
        if (rawScores) {
          const overall = rawScores.overall_score !== undefined ? rawScores.overall_score : rawScores.overallScore;
          if (overall !== undefined) {
            scoresObj = {
              pitch_accuracy: rawScores.pitch_accuracy !== undefined ? rawScores.pitch_accuracy : rawScores.pitchAccuracy,
              rhythm_accuracy: rawScores.rhythm_accuracy !== undefined ? rawScores.rhythm_accuracy : rawScores.rhythmAccuracy,
              tempo_accuracy: rawScores.tempo_accuracy !== undefined ? rawScores.tempo_accuracy : rawScores.tempoAccuracy,
              chroma_similarity: rawScores.chroma_similarity !== undefined ? rawScores.chroma_similarity : rawScores.chromaSimilarity,
              overall_score: overall,
              best_tempo: rawScores.best_tempo !== undefined ? rawScores.best_tempo : rawScores.bestTempo,
              best_gap_threshold: rawScores.best_gap_threshold !== undefined ? rawScores.best_gap_threshold : rawScores.bestGapThreshold,
              best_grid_resolution: rawScores.best_grid_resolution !== undefined ? rawScores.best_grid_resolution : rawScores.bestGridResolution,
            };
            setQualityScores(scoresObj as any);
          } else {
            console.log('[MeloNote] quality_scores object found but overall_score is missing:', JSON.stringify(rawScores));
          }
        } else {
          console.log('[MeloNote] No quality_scores found in server response keys:', Object.keys(data));
        }
        
        let notesToStore;
        if (data.treble_notes && data.bass_notes) {
          notesToStore = {
            treble: data.treble_notes,
            bass: data.bass_notes,
            playback: data.notes
          };
        } else {
          notesToStore = data.notes;
        }
        setConvertedNotes(notesToStore);
        
        const newProjectId = data.project_id || `local_${Date.now()}`;
        setProjectId(newProjectId);
        setRawNoteEvents(data.raw_note_events || []);
        setCameFromProjects(false);
        setShowSheet(true);
        setShowDiscardModal(false);

        // Save project locally
        try {
          const cleanName = fileName.replace(/\.[^/.]+$/, "").replace(/[_\s]+/g, " ");
          const projectData = {
            id: newProjectId,
            name: cleanName,
            date: new Date().toISOString(),
            recordingURI: recordingURI,
            convertedNotes: notesToStore,
            rawNoteEvents: data.raw_note_events || [],
            musicXML: data.musicxml || '',
            timeSignature: data.time_signature || '4/4',
            detectedTempo: data.detected_tempo || 120,
            qualityScores: scoresObj,
            duration: player?.duration || duration || seconds || 0,
            audioSize: audioInfo.size,
          };
          
          if (Platform.OS === 'web') {
            localStorage.setItem('melo_project_' + newProjectId, JSON.stringify(projectData));
            console.log('[convertAudio] Saved project to local storage:', newProjectId);
          } else {
            const projectsDir = `${FileSystem.documentDirectory}projects/`;
            const dirInfo = await FileSystem.getInfoAsync(projectsDir);
            if (!dirInfo.exists) {
              await FileSystem.makeDirectoryAsync(projectsDir, { intermediates: true });
            }
            
            const projectFileUri = `${projectsDir}${newProjectId}.json`;
            await FileSystem.writeAsStringAsync(projectFileUri, JSON.stringify(projectData));
            console.log('[convertAudio] Saved project locally:', projectFileUri);
          }
        } catch (saveErr) {
          console.error('[convertAudio] Failed to save project locally:', saveErr);
        }

        console.log('Notes updated. Quality:', data.quality_scores?.overall_score || data.qualityScores?.overallScore);
      } else {
        resetConvertedSheet();
        Alert.alert(
          'No notes detected',
          'Try a clearer recording or a shorter melody.'
        );
      }
    } catch (err) {
      if (isDiscardedRef.current) return;
      console.log('Convert Error:');
      console.log(err);
      // Only show "backend" message for actual network/fetch errors
      const errMsg = err instanceof Error ? err.message : String(err);
      const isNetworkError =
        errMsg.includes('Network request failed') ||
        errMsg.includes('connect') ||
        errMsg.includes('ECONNREFUSED') ||
        errMsg.includes('fetch');
      Alert.alert(
        'Conversion Error',
        isNetworkError
          ? 'Could not connect to the backend server. Make sure it is running.'
          : errMsg || 'An unexpected error occurred before sending the audio.'
      );
    } finally {
      if (!isDiscardedRef.current) {
        setIsConverting(false);
        setShowDiscardModal(false);
      }
    }
  }

  const [pendingPDFAction, setPendingPDFAction] = useState<'PDF' | 'ZIP' | null>(null);

  const processPDFResponse = async (pdfBase64: string) => {
    const action = pendingPDFAction;
    setPendingPDFAction(null);
    
    if (action === 'PDF') {
      try {
        const filename = `${audioInfo.name || 'transcription'}.pdf`;
        const base64Data = pdfBase64.split(',')[1];
        
        if (Platform.OS === 'web') {
          const element = document.createElement('a');
          element.href = pdfBase64;
          element.download = filename;
          document.body.appendChild(element);
          element.click();
          document.body.removeChild(element);
        } else {
          const fileUri = `${FileSystem.cacheDirectory}${filename}`;
          await FileSystem.writeAsStringAsync(fileUri, base64Data, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf', dialogTitle: 'Share PDF Score' });
        }
      } catch (err) {
        console.error('[PDF Export] Error:', err);
        Alert.alert('Error', 'Failed to share PDF score.');
      } finally {
        setExportingFormat(null);
      }
    } else if (action === 'ZIP') {
      try {
        if (!projectId) throw new Error('Project ID not set');
        const url = `${BACKEND_URL}/export/zip/${projectId}`;
        const filename = `${audioInfo.name || 'transcription'}_bundle.zip`;
        
        const payload: any = { pdf_base64: pdfBase64 };
        payload.musicxml = musicXML;
        payload.raw_notes = rawNoteEvents;
        payload.tempo = detectedTempo || 120;
        payload.best_grid_resolution = qualityScores?.best_grid_resolution || 0.25;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        
        if (!response.ok) throw new Error('Failed to compile ZIP bundle on server');
        const blob = await response.blob();
        
        if (Platform.OS === 'web') {
          const element = document.createElement('a');
          element.href = URL.createObjectURL(blob);
          element.download = filename;
          document.body.appendChild(element);
          element.click();
          document.body.removeChild(element);
        } else {
          const reader = new FileReader();
          await new Promise<void>((resolve, reject) => {
            reader.onloadend = async () => {
              try {
                const base64data = (reader.result as string).split(',')[1];
                const fileUri = `${FileSystem.cacheDirectory}${filename}`;
                await FileSystem.writeAsStringAsync(fileUri, base64data, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                await Sharing.shareAsync(fileUri, { mimeType: 'application/zip', dialogTitle: 'Share Project Bundle' });
                resolve();
              } catch (e) {
                reject(e);
              }
            };
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(blob);
          });
        }
      } catch (err: any) {
        console.error('[ZIP Export] Error:', err);
        Alert.alert('Error', err.message || 'Failed to export ZIP project bundle.');
      } finally {
        setExportingFormat(null);
      }
    }
  };

  const downloadFileViaPost = async (
    endpoint: string,
    postData: any,
    filename: string,
    mimeType: string,
    dialogTitle: string
  ) => {
    const url = `${BACKEND_URL}${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postData),
    });

    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }

    const blob = await response.blob();

    if (Platform.OS === 'web') {
      const element = document.createElement('a');
      element.href = URL.createObjectURL(blob);
      element.download = filename;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    } else {
      const reader = new FileReader();
      await new Promise<void>((resolve, reject) => {
        reader.onloadend = async () => {
          try {
            const base64data = (reader.result as string).split(',')[1];
            const fileUri = `${FileSystem.cacheDirectory}${filename}`;
            await FileSystem.writeAsStringAsync(fileUri, base64data, {
              encoding: FileSystem.EncodingType.Base64,
            });
            await Sharing.shareAsync(fileUri, { mimeType, dialogTitle });
            resolve();
          } catch (e) {
            reject(e);
          }
        };
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(blob);
      });
    }
  };

  // Use a ref to hold the latest handler so web message listener always uses current mode
  const handlePlaybackMessageRef = useRef<(data: any) => void>(() => {});
  const handlePlaybackMessage = useCallback((data: any) => {
    if (data.type === 'PLAYBACK_PROGRESS' || data.type === 'PLAYBACK_STATE') {
      // In original playback mode, ignore WebView's progress and playing updates
      // to keep original audio playback and detected duration unaffected.
      if (playbackModeRef.current === 'original') {
        return;
      }
      if (
        isModeSwitchingRef.current &&
        modeSwitchingTimeRef.current !== null &&
        Date.now() - modeSwitchingTimeRef.current < 500
      ) {
        console.log('[RECORD WEB MSG CLAMP] Ignoring progress/state event during mode switch:', data.type);
        return;
      }

      if (data.currentTime !== undefined) {
        console.log('[RECORD WEB MSG] type =', data.type, '| data.currentTime =', (typeof data.currentTime === 'number' ? data.currentTime.toFixed(6) : data.currentTime), '| playbackMode =', playbackModeRef.current);
        setCurrentTime(data.currentTime);
        playerCurrentTimeRef.current = data.currentTime;
      }
      if (data.duration !== undefined) {
        setDuration(data.duration);
      }
      if (data.isPlaying !== undefined) {
        if (playbackModeRef.current === 'notation') {
          console.log('[AUDIT] React Native updating isPlaying state to:', data.isPlaying);
          setIsPlaying(data.isPlaying);
        }
      }
    } else if (data.type === 'TEMPO_CHANGE') {
      if (data.tempo !== undefined) {
        console.log('[RECORD] Received TEMPO_CHANGE, but ignoring setDetectedTempo to preserve original detected tempo:', data.tempo);
        // setDetectedTempo(data.tempo); // Intentionally removed
      }
      if (data.rate !== undefined) {
        // Enforce pause and reset on tempo change only in notation playback mode
        if (playbackModeRef.current === 'notation') {
          isPlayingRef.current = false;
          setIsPlaying(false);
          
          // Reset timeline and progress bar
          setCurrentTime(0);
          playerCurrentTimeRef.current = 0;
          progressShared.value = 0;
          
          // Also send PAUSE and SEEK to WebView to ensure it's completely stopped and reset
          const pauseMsg = { type: 'PAUSE' };
          const seekMsg = { type: 'SEEK', time: 0 };
          console.log('[AUDIT] Sending messages to WebView:', pauseMsg, seekMsg);
          if (Platform.OS === 'web') {
            const iframe = document.getElementById('record-sheet-music-iframe') as HTMLIFrameElement;
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage(JSON.stringify(pauseMsg), '*');
              iframe.contentWindow.postMessage(JSON.stringify(seekMsg), '*');
            }
          } else if (webViewRef.current) {
            webViewRef.current.postMessage(JSON.stringify(pauseMsg));
            webViewRef.current.postMessage(JSON.stringify(seekMsg));
          }
        }
        // We do not update playbackRate or duration with scaled values, keeping original audio and detected time unaffected.
      }
    } else if (data.type === 'UNLOCK_AUDIO_SUCCESS') {
      console.log('[AUDIT] RN received UNLOCK_AUDIO_SUCCESS');
      if (pendingPlayAfterUnlockRef.current) {
        pendingPlayAfterUnlockRef.current = false;
        const msg = { type: 'PLAY' };
        console.log('[AUDIT] Sending PLAY message to WebView after successful unlock:', msg);
        if (Platform.OS === 'web') {
          const iframe = document.getElementById('record-sheet-music-iframe') as HTMLIFrameElement;
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage(JSON.stringify(msg), '*');
          }
        } else {
          if (webViewRef.current) {
            webViewRef.current.postMessage(JSON.stringify(msg));
          }
        }
      }
    }
  }, [player, playbackRate]);
  handlePlaybackMessageRef.current = handlePlaybackMessage;

  const handleWebViewMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'PDF_GENERATED') {
        await processPDFResponse(data.data);
      } else if (data.type === 'PDF_ERROR') {
        Alert.alert('PDF Generation Error', data.error);
        setExportingFormat(null);
        setPendingPDFAction(null);
      } else {
        handlePlaybackMessage(data);
      }
    } catch (err) {
      // Ignore non-JSON or unrelated messages
    }
  };

  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleWebMessage = async (event: MessageEvent) => {
        try {
          const iframe = document.getElementById('record-sheet-music-iframe') as HTMLIFrameElement;
          if (!iframe || event.source !== iframe.contentWindow) return;
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (data && data.type === 'PDF_GENERATED') {
            await processPDFResponse(data.data);
          } else if (data && data.type === 'PDF_ERROR') {
            Alert.alert('PDF Generation Error', data.error);
            setExportingFormat(null);
            setPendingPDFAction(null);
          } else {
            // Use ref so listener always calls the latest version of the handler
            handlePlaybackMessageRef.current(data);
          }
        } catch (e) {
          // Ignore non-JSON or unrelated messages
        }
      };
      window.addEventListener('message', handleWebMessage);
      return () => window.removeEventListener('message', handleWebMessage);
    }
    // Intentionally only register once per mount — ref ensures latest handler is always called
  }, [projectId]);

  const handleDownloadPDF = () => {
    setExportingFormat('PDF');
    setPendingPDFAction('PDF');
    if (Platform.OS === 'web') {
      const iframe = document.getElementById('record-sheet-music-iframe') as HTMLIFrameElement;
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(JSON.stringify({ type: 'GENERATE_PDF' }), '*');
      } else {
        setExportingFormat(null);
        setPendingPDFAction(null);
        Alert.alert('Error', 'Iframe not available.');
      }
    } else {
      if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify({ type: 'GENERATE_PDF' }));
      } else {
        setExportingFormat(null);
        setPendingPDFAction(null);
        Alert.alert('Error', 'WebView not ready.');
      }
    }
  };

  const handleDownloadMusicXML = async () => {
    if (!musicXML) return;
    setExportingFormat('MusicXML');
    try {
      const filename = `${audioInfo.name || 'transcription'}.musicxml`;
      if (Platform.OS === 'web') {
        const file = new Blob([musicXML], { type: 'application/xml' });
        const element = document.createElement('a');
        element.href = URL.createObjectURL(file);
        element.download = filename;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
      } else {
        const fileUri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, musicXML, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        await Sharing.shareAsync(fileUri, { mimeType: 'application/xml', dialogTitle: 'Share MusicXML' });
      }
    } catch (err) {
      console.error('[MusicXML Export] Error:', err);
      Alert.alert('Error', 'Failed to export MusicXML.');
    } finally {
      setExportingFormat(null);
    }
  };

  const handleDownloadOriginalAudio = async () => {
    if (!recordingURI) return;
    setExportingFormat('Original Audio');
    try {
      const uriFileName = recordingURI.split('/').pop()?.split('?')[0] || 'recording.wav';
      const extension = uriFileName.substring(uriFileName.lastIndexOf('.'));
      const filename = audioInfo.name ? (audioInfo.name.includes('.') ? audioInfo.name : `${audioInfo.name}${extension}`) : uriFileName;
      
      if (Platform.OS === 'web') {
        const response = await fetch(recordingURI);
        const blob = await response.blob();
        const element = document.createElement('a');
        element.href = URL.createObjectURL(blob);
        element.download = filename;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
      } else {
        await Sharing.shareAsync(recordingURI, { dialogTitle: 'Share Original Audio' });
      }
    } catch (err) {
      console.error('[Original Audio Export] Error:', err);
      Alert.alert('Error', 'Failed to share original audio.');
    } finally {
      setExportingFormat(null);
    }
  };

  const handleDownloadMIDI = async () => {
    if (!projectId) {
      Alert.alert('Error', 'Project session not available.');
      return;
    }
    setExportingFormat('MIDI');
    try {
      const filename = `${audioInfo.name || 'transcription'}.mid`;
      
      // If the project ID is a local fallback ID, jump straight to POST
      const isLocal = projectId.startsWith('local_');
      
      if (isLocal) {
        await downloadFileViaPost(
          `/export/midi/${projectId}`,
          {
            raw_notes: rawNoteEvents,
            tempo: detectedTempo || 120,
          },
          filename,
          'audio/midi',
          'Share MIDI'
        );
      } else {
        // Try GET first
        const url = `${BACKEND_URL}/export/midi/${projectId}`;
        if (Platform.OS === 'web') {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error('GET failed');
          }
          const blob = await response.blob();
          const element = document.createElement('a');
          element.href = URL.createObjectURL(blob);
          element.download = filename;
          document.body.appendChild(element);
          element.click();
          document.body.removeChild(element);
        } else {
          const fileUri = `${FileSystem.cacheDirectory}${filename}`;
          const downloadResult = await FileSystem.downloadAsync(url, fileUri);
          if (downloadResult.status !== 200) {
            throw new Error('GET failed');
          }
          await Sharing.shareAsync(downloadResult.uri, { mimeType: 'audio/midi', dialogTitle: 'Share MIDI' });
        }
      }
    } catch (err) {
      console.log('[MIDI Export] GET failed, falling back to POST:', err);
      // Fallback: POST to backend
      try {
        const filename = `${audioInfo.name || 'transcription'}.mid`;
        await downloadFileViaPost(
          `/export/midi/${projectId}`,
          {
            raw_notes: rawNoteEvents,
            tempo: detectedTempo || 120,
          },
          filename,
          'audio/midi',
          'Share MIDI'
        );
      } catch (postErr) {
        console.error('[MIDI Export Fallback] Error:', postErr);
        Alert.alert('Error', 'Failed to export MIDI from backend.');
      }
    } finally {
      setExportingFormat(null);
    }
  };

  const handleDownloadPlaybackWAV = async () => {
    if (!projectId) {
      Alert.alert('Error', 'Project session not available.');
      return;
    }
    setExportingFormat('Playback Audio');
    try {
      const filename = `Playback_${audioInfo.name || 'transcription'}.wav`;
      const isLocal = projectId.startsWith('local_');
      
      if (isLocal) {
        await downloadFileViaPost(
          `/export/wav/${projectId}`,
          {
            raw_notes: rawNoteEvents,
            tempo: detectedTempo || 120,
            best_grid_resolution: qualityScores?.best_grid_resolution || 0.25,
          },
          filename,
          'audio/wav',
          'Share Playback Audio'
        );
      } else {
        const url = `${BACKEND_URL}/export/wav/${projectId}`;
        if (Platform.OS === 'web') {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error('GET failed');
          }
          const blob = await response.blob();
          const element = document.createElement('a');
          element.href = URL.createObjectURL(blob);
          element.download = filename;
          document.body.appendChild(element);
          element.click();
          document.body.removeChild(element);
        } else {
          const fileUri = `${FileSystem.cacheDirectory}${filename}`;
          const downloadResult = await FileSystem.downloadAsync(url, fileUri);
          if (downloadResult.status !== 200) {
            throw new Error('GET failed');
          }
          await Sharing.shareAsync(downloadResult.uri, { mimeType: 'audio/wav', dialogTitle: 'Share Playback Audio' });
        }
      }
    } catch (err) {
      console.log('[WAV Playback Export] GET failed, falling back to POST:', err);
      try {
        const filename = `Playback_${audioInfo.name || 'transcription'}.wav`;
        await downloadFileViaPost(
          `/export/wav/${projectId}`,
          {
            raw_notes: rawNoteEvents,
            tempo: detectedTempo || 120,
            best_grid_resolution: qualityScores?.best_grid_resolution || 0.25,
          },
          filename,
          'audio/wav',
          'Share Playback Audio'
        );
      } catch (postErr) {
        console.error('[WAV Playback Export Fallback] Error:', postErr);
        Alert.alert('Error', 'Failed to export playback audio.');
      }
    } finally {
      setExportingFormat(null);
    }
  };

  const handleDownloadZIP = () => {
    if (!projectId) {
      Alert.alert('Error', 'Project session not available.');
      return;
    }
    setExportingFormat('ZIP Bundle');
    setPendingPDFAction('ZIP');
    if (Platform.OS === 'web') {
      const iframe = document.getElementById('record-sheet-music-iframe') as HTMLIFrameElement;
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(JSON.stringify({ type: 'GENERATE_PDF' }), '*');
      } else {
        setExportingFormat(null);
        setPendingPDFAction(null);
        Alert.alert('Error', 'Iframe not available.');
      }
    } else {
      if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify({ type: 'GENERATE_PDF' }));
      } else {
        setExportingFormat(null);
        setPendingPDFAction(null);
        Alert.alert('Error', 'WebView not ready.');
      }
    }
  };



  function formatTime(sec: number) {
    const roundedSec = Math.round(sec);
    const minutes = Math.floor(roundedSec / 60);
    const seconds = roundedSec % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }

  function formatFileSize(size: number) {
    if (size < 1024) {
      return `${size} B`;
    }

    if (size < 1024 * 1024) {
      return `${(
        size / 1024
      ).toFixed(1)} KB`;
    }

    return `${(
      size /
      (1024 * 1024)
    ).toFixed(1)} MB`;
  }

  async function startRecording() {
    try {
      const status =
        await AudioModule.requestRecordingPermissionsAsync();

      if (!status.granted) {
        alert('Permission not granted');

        return;
      }

      setCurrentTime(0);

      setIsPlaying(false);

      setRecordingURI('');

      resetConvertedSheet();

      setSeconds(0);

      setIsRecording(true);

      await recorder.prepareToRecordAsync();

      recorder.record();

      console.log('Recording started');
    } catch (err) {
      console.log(err);
    }
  }

  async function stopRecording() {
    try {
      await recorder.stop();

      const uri = recorder.uri;

      resetConvertedSheet();

      setRecordingURI(uri || '');

      setNativeAudioFile(null);

      setAudioInfo({
        name: 'Recorded Audio',
        size: seconds*16000,
      });

      setDuration(seconds);

      setIsRecording(false);

      console.log(uri);
    } catch (err) {
      console.log(err);
    }
  }

  const handleDragStart = () => {
    isDraggingRef.current = true;
    wasPlayingBeforeDragRef.current = isPlaying;
    if (isPlaying) {
      const isOriginalMode = playbackMode === 'original' || !showSheet;
      if (isOriginalMode) {
        player.pause();
      } else {
        const pauseMsg = { type: 'PAUSE' };
        if (Platform.OS === 'web') {
          const iframe = document.getElementById('record-sheet-music-iframe') as HTMLIFrameElement;
          if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage(JSON.stringify(pauseMsg), '*');
        } else if (webViewRef.current) {
          webViewRef.current.postMessage(JSON.stringify(pauseMsg));
        }
      }
      setIsPlaying(false);
      isPlayingRef.current = false;
    }
  };

  const handleSeek = (time: number) => {
    isDraggingRef.current = false;
    const isOriginalMode = playbackMode === 'original' || !showSheet;
    if (isOriginalMode) {
      player.seekTo(time);
      playerCurrentTimeRef.current = time;
      setCurrentTime(time);
      if (wasPlayingBeforeDragRef.current) {
        player.play();
        setIsPlaying(true);
        isPlayingRef.current = true;
      }
    } else {
      const seekMsg = { type: 'SEEK', time };
      if (Platform.OS === 'web') {
        const iframe = document.getElementById('record-sheet-music-iframe') as HTMLIFrameElement;
        if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage(JSON.stringify(seekMsg), '*');
      } else if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify(seekMsg));
      }
      playerCurrentTimeRef.current = time;
      setCurrentTime(time);
      if (wasPlayingBeforeDragRef.current) {
        const playMsg = { type: 'PLAY' };
        if (Platform.OS === 'web') {
          const iframe = document.getElementById('record-sheet-music-iframe') as HTMLIFrameElement;
          if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage(JSON.stringify(playMsg), '*');
        } else if (webViewRef.current) {
          webViewRef.current.postMessage(JSON.stringify(playMsg));
        }
        setIsPlaying(true);
        isPlayingRef.current = true;
      }
    }
  };

  async function playRecording() {
    try {
      console.log('[AUDIT] Play button pressed');
      console.log('[AUDIT] Current state:', {
        playbackMode,
        isPlaying,
        projectId,
        showSheet
      });
      const isOriginalMode = playbackMode === 'original' || !showSheet;
      if (isOriginalMode) {
        if (isPlaying) {
          // Capture exact position BEFORE setting isPlayingRef so the last
          // ticker tick (which may still fire) has the correct frozen value.
          const exactTime = playerCurrentTimeRef.current;
          // Synchronously block further ticker state-updates so the post-pause
          // native tick cannot snap currentTime back to an integer value.
          isPlayingRef.current = false;
          console.log('[RECORD PAUSE] exactTime =', exactTime.toFixed(6), '| player.currentTime (may be stale) =', (player.currentTime ?? 'N/A'));
          
          // Use the high-freq ref value; fall back to React state only if ref is 0
          const resolvedTime = exactTime > 0 ? exactTime : currentTime;
          console.log('[RECORD PAUSE] resolvedTime stored =', resolvedTime.toFixed(6));
          playerCurrentTimeRef.current = resolvedTime;
          setCurrentTime(resolvedTime);
          progressShared.value =
            duration > 0
              ? (resolvedTime / duration) * 100
              : 0;
          setIsPlaying(false);
          player.pause();
          setTimeout(() => {
            console.log(
              '[AFTER PAUSE]',
              'currentTime=', currentTimeRef.current,
              'stored=', playerCurrentTimeRef.current
            );
          }, 300);
        } else {
          if (currentTime >= duration) {
            console.log('[RECORD PLAY] restarting from 0');
            playerCurrentTimeRef.current = 0;
            setCurrentTime(0);
            progressShared.value = 0;
            player.seekTo(0);
          } else {
            console.log('[RECORD PLAY] resuming from currentTime =', currentTime.toFixed(6));
            // Seek to the exact stored position before playing, ensuring the
            // player is at the right spot even after a mode switch.
            player.seekTo(currentTime);
          }
          isPlayingRef.current = true;
          player.shouldCorrectPitch = true;
          (player as any).pitchCorrectionQuality = 'high';
          player.setPlaybackRate(1.0, 'high'); // Apply speed before playing
          player.play();
          setIsPlaying(true);
        }
      } else {
        if (!projectId) {
          console.log('[AUDIT] playRecording returned early because projectId is missing');
          return;
        }

        if (isPlaying) {
          const msg = { type: 'PAUSE' };
          console.log('[AUDIT] Sending PAUSE message to WebView:', msg);
          if (Platform.OS === 'web') {
            const iframe = document.getElementById('record-sheet-music-iframe') as HTMLIFrameElement;
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage(JSON.stringify(msg), '*');
            }
          } else {
            if (webViewRef.current) {
              webViewRef.current.postMessage(JSON.stringify(msg));
            }
          }
        } else {
          pendingPlayAfterUnlockRef.current = true;
          const msg = { type: 'UNLOCK_AUDIO' };
          console.log('[AUDIT] Sending UNLOCK_AUDIO message to WebView:', msg);
          if (Platform.OS === 'web') {
            const iframe = document.getElementById('record-sheet-music-iframe') as HTMLIFrameElement;
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage(JSON.stringify(msg), '*');
            }
          } else {
            if (webViewRef.current) {
              webViewRef.current.postMessage(JSON.stringify(msg));
            }
          }
        }
      }
    } catch (err) {
      console.log(err);
    }
  }

  async function restartPlayback() {
    try {
      const isOriginalMode = playbackMode === 'original' || !showSheet;
      if (isOriginalMode) {
        setCurrentTime(0);
        playerCurrentTimeRef.current = 0;
        isPlayingRef.current = true;
        
        player.seekTo(0);
        player.play();
        setIsPlaying(true);
        
      } else {
        const msg = { type: 'RESTART' };
        console.log('[AUDIT] Sending message to WebView:', msg);
        if (Platform.OS === 'web') {
          const iframe = document.getElementById('record-sheet-music-iframe') as HTMLIFrameElement;
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage(JSON.stringify(msg), '*');
          }
        } else {
          if (webViewRef.current) {
            webViewRef.current.postMessage(JSON.stringify(msg));
          }
        }
      }
    } catch (err) {
      console.log(err);
    }
  }

  async function pickAudioFile() {
    try {
      setCurrentTime(0);

      setIsPlaying(false);

      resetConvertedSheet();

      if (
        Platform.OS === 'android'
      ) {
        const result =
          await ExpoFile.pickFileAsync(
            {
              mimeTypes: [
                'audio/*',
              ],
            }
          );

        if (result.canceled) return;

        const pickedFile =
          result.result;

        const cachedFile =
          new ExpoFile(
            Paths.cache,
            `${Date.now()}-${pickedFile.name}`
          );

        await pickedFile.copy(
          cachedFile
        );

        setRecordingURI(
          cachedFile.uri
        );

        setNativeAudioFile(
          cachedFile
        );

        setAudioInfo({
          name: pickedFile.name,
          size: pickedFile.size || 0,
        });

        console.log(
          cachedFile.uri
        );

        return;
      }

      const result =
        await DocumentPicker.getDocumentAsync(
          {
            type: 'audio/*',
            copyToCacheDirectory: true,
          }
        );

      if (result.canceled) return;

      const file = result.assets[0];

      setRecordingURI(file.uri);

      setNativeAudioFile(null);

      setAudioInfo({
        name: file.name,
        size: file.size || 0,
      });

      console.log(file.uri);
    } catch (err) {
      console.log(err);
    }
  }

  function startEqualizerAnimation() {
    bar1.value = withRepeat(
      withSequence(
        withTiming(40, { duration: 300 }),
        withTiming(15, { duration: 300 })
      ),
      -1,
      true
    );

    bar2.value = withRepeat(
      withSequence(
        withTiming(60, { duration: 250 }),
        withTiming(20, { duration: 250 })
      ),
      -1,
      true
    );

    bar3.value = withRepeat(
      withSequence(
        withTiming(40, { duration: 350 }),
        withTiming(15, { duration: 350 })
      ),
      -1,
      true
    );
  }

  function stopEqualizerAnimation() {
    bar1.value = withTiming(20);
    bar2.value = withTiming(20);
    bar3.value = withTiming(20);
  }

  if (isConverting) {
    return (
      <View style={{ flex: 1, backgroundColor: '#050507' }}>
        <LinearGradient colors={['#0F0F12', '#050507']} style={StyleSheet.absoluteFill} />
        
        {/* Header Bar */}
        <View style={{ height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' }}>
          <Pressable
            onPress={() => setShowDiscardModal(true)}
            style={({ pressed }) => ({
              padding: 8,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="arrow-back" size={24} color="white" />
          </Pressable>
          <Text style={{ color: 'white', fontSize: 16, fontWeight: '700' }}>Converting Score</Text>
          <View style={{ width: 40 }} />
        </View>

        <MusicLoadingAnimation
          subtitle="Detecting pitch, rests, tempo, and time signature…"
        />

        {/* Discard Modal */}
        <Modal
          visible={showDiscardModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowDiscardModal(false)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.75)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            onPress={() => setShowDiscardModal(false)}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                width: '85%',
                maxWidth: 380,
                backgroundColor: '#16161A',
                borderRadius: 24,
                padding: 24,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.08)',
              }}
            >
              <Text style={{ color: 'white', fontSize: 20, fontWeight: '800', marginBottom: 8 }}>
                Discard Conversion?
              </Text>
              <Text style={{ color: '#8e8e93', fontSize: 14, lineHeight: 20, marginBottom: 24 }}>
                Do you wish to discard conversion? The audio analysis will be cancelled.
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
                <Pressable
                  onPress={() => setShowDiscardModal(false)}
                  style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)' }}
                >
                  <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>No</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    isDiscardedRef.current = true;
                    setIsConverting(false);
                    setShowDiscardModal(false);
                    try {
                      player.pause();
                      player.seekTo(0);
                    } catch (e) {
                      console.warn('Error resetting player:', e);
                    }
                    playerCurrentTimeRef.current = 0;
                    setCurrentTime(0);
                    setIsPlaying(false);
                    stopEqualizerAnimation();
                  }}
                  style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#FF3B30' }}
                >
                  <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Yes</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#050507' }}>
      <LinearGradient colors={['#0F0F12', '#050507']} style={StyleSheet.absoluteFill} />
      
      {!showSheet ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 160, gap: 24 }}
        >
          {/* Waveform / Visualizer section */}
          <GlassCard style={{ height: 180, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
            {isRecording ? (
              <>
                <Text style={{ color: '#FF4FA3', fontSize: 32, fontWeight: '800', letterSpacing: 1 }}>
                  {formatTime(seconds)}
                </Text>
                <Text style={{ color: '#8E929A', fontSize: 14, fontWeight: '600' }}>
                  Recording Audio...
                </Text>
                {/* Audio Waveform mock waves */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 40, marginTop: 10 }}>
                  <Animated.View style={[{ width: 4, backgroundColor: '#FF8A00', borderRadius: 2 }, bar1Style]} />
                  <Animated.View style={[{ width: 4, backgroundColor: '#FF4FA3', borderRadius: 2 }, bar2Style]} />
                  <Animated.View style={[{ width: 4, backgroundColor: '#7B61FF', borderRadius: 2 }, bar3Style]} />
                  <Animated.View style={[{ width: 4, backgroundColor: '#FF4FA3', borderRadius: 2 }, bar2Style]} />
                  <Animated.View style={[{ width: 4, backgroundColor: '#FF8A00', borderRadius: 2 }, bar1Style]} />
                </View>
              </>
            ) : recordingURI !== '' ? (
              <>
                <Ionicons name="musical-notes" size={44} color="#7B61FF" />
                <View style={{ alignItems: 'center' }}>
                  <Text numberOfLines={1} style={{ color: 'white', fontSize: 16, fontWeight: '700', maxWidth: 240 }}>
                    {audioInfo.name}
                  </Text>
                  <Text style={{ color: '#8E929A', fontSize: 13, marginTop: 4 }}>
                    {formatFileSize(audioInfo.size)} • {formatTime(duration)}
                  </Text>
                </View>
                <Pressable
                  onPress={removeAudio}
                  style={({ pressed }) => ({
                    position: 'absolute',
                    top: 14,
                    right: 14,
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Ionicons name="close" size={18} color="#FFFFFF" />
                </Pressable>
              </>
            ) : (
              <>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="mic-outline" size={28} color="#FF8A00" />
                </View>
                <Text style={{ color: '#8E929A', fontSize: 14, fontWeight: '600', textAlign: 'center', paddingHorizontal: 30 }}>
                  Record a melody or upload an audio file to transcribe
                </Text>
              </>
            )}
          </GlassCard>

          {/* Dotted Upload Card (when there is no recording yet) */}
          {recordingURI === '' && !isRecording && (
            <GlassCard style={{ padding: 10, height: 140 }}>
              <Pressable
                onPress={pickAudioFile}
                style={({ pressed }) => [
                  { flex: 1, borderWidth: 2, borderColor: 'rgba(255, 79, 163, 0.12)', borderStyle: 'dashed', borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 6 },
                  pressed && { backgroundColor: 'rgba(255, 255, 255, 0.02)' }
                ]}
              >
                <Ionicons name="cloud-upload-outline" size={32} color="#FF4FA3" style={{ marginBottom: 4 }} />
                <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>Upload audio file</Text>
                <Text style={{ color: '#8E929A', fontSize: 11 }}>Supports WAV, MP3, M4A up to 20MB</Text>
              </Pressable>
            </GlassCard>
          )}

          {/* Large Spotify-inspired Record Button Area */}
          {recordingURI === '' && (
            <View style={{ alignItems: 'center', justifyContent: 'center', marginVertical: 10 }}>
              <Pressable
                onPress={isRecording ? stopRecording : startRecording}
                style={({ pressed }) => ({
                  width: 110,
                  height: 110,
                  borderRadius: 55,
                  backgroundColor: isRecording ? '#FF2D55' : '#FF8A00',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: isRecording ? '#FF2D55' : '#FF8A00',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.35,
                  shadowRadius: 16,
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                })}
              >
                <Ionicons name={isRecording ? 'stop' : 'mic'} size={46} color="white" />
              </Pressable>
              <Text style={{ color: '#B0B4BA', fontSize: 13, fontWeight: '700', marginTop: 14, letterSpacing: 0.5 }}>
                {isRecording ? 'TAP TO STOP' : 'TAP TO RECORD'}
              </Text>
            </View>
          )}

          {/* Convert Actions (when recording is finished) */}
          {!isRecording && recordingURI !== '' && (
            <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
              <PrimaryButton
                title="Convert to Sheet Music"
                icon="sparkles-outline"
                onPress={convertAudio}
              />
            </View>
          )}
        </ScrollView>
      ) : (
        <CreateScreen
          webViewRef={webViewRef}
          onWebViewMessage={handleWebViewMessage}
          sheetMusicId="record-sheet-music-iframe"
          initialProjectId={projectId || undefined}
          initialNotes={convertedNotes}
          initialTimeSignature={timeSignature}
          initialTempo={detectedTempo || 120}
          initialMusicXML={musicXML}
          defaultEditMode={false}
          measuresPerSystem={4}
          initialTitle={audioInfo.name ? audioInfo.name.replace(/\.[^/.]+$/, "") : 'Untitled Score'}
          onExit={() => {
            if (cameFromProjects) {
              resetConvertedSheet();
              router.push('/projects');
            } else {
              setShowRecordAnotherModal(true);
            }
          }}
        />
      )}

      {/* Remove Audio Modal */}
      <Modal
        visible={removeModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setRemoveModalVisible(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.75)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={() => setRemoveModalVisible(false)}
        >
          <GlassCard
            style={{
              width: '85%',
              maxWidth: 380,
              gap: 12,
            }}
          >
            <Text style={{ color: 'white', fontSize: 20, fontWeight: '800' }}>Remove Audio</Text>
            <Text style={{ color: '#8e8e93', fontSize: 14, lineHeight: 20 }}>
              Are you sure you want to remove this audio?
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
              <Pressable
                onPress={() => setRemoveModalVisible(false)}
                style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)' }}
              >
                <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setRemoveModalVisible(false);
                  performRemove();
                }}
                style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#FF3B30' }}
              >
                <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Remove</Text>
              </Pressable>
            </View>
          </GlassCard>
        </Pressable>
      </Modal>

      {/* Floating Spotify-style Playback Bar at the bottom */}
      {recordingURI !== '' && (
        <GlassCard
          style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            right: 20,
            padding: 12,
            borderRadius: 24,
            borderColor: 'rgba(255,255,255,0.12)',
            zIndex: 900,
          }}
        >
          {/* Playback Mode Selector */}
          {showSheet && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: 3, gap: 4 }}>
                <Pressable
                  onPress={() => {
                    if (playbackMode === 'notation') return;
                    isModeSwitchingRef.current = true;
                    modeSwitchingTimeRef.current = Date.now();
                    const targetTime = currentTime;
                    const targetPlaying = isPlaying;
                    if (isPlaying) {
                      player.pause();
                    }
                    setCurrentTime(targetTime);
                    playerCurrentTimeRef.current = targetTime;
                    setPlaybackMode('notation');

                    const seekMsg = { type: 'SEEK', time: targetTime };
                    if (Platform.OS === 'web') {
                      const iframe = document.getElementById('record-sheet-music-iframe') as HTMLIFrameElement;
                      if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage(JSON.stringify(seekMsg), '*');
                    } else if (webViewRef.current) {
                      webViewRef.current.postMessage(JSON.stringify(seekMsg));
                    }

                    if (targetPlaying) {
                      const playMsg = { type: 'PLAY' };
                      if (Platform.OS === 'web') {
                        const iframe = document.getElementById('record-sheet-music-iframe') as HTMLIFrameElement;
                        if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage(JSON.stringify(playMsg), '*');
                      } else if (webViewRef.current) {
                        webViewRef.current.postMessage(JSON.stringify(playMsg));
                      }
                    }

                    setTimeout(() => {
                      isModeSwitchingRef.current = false;
                    }, 500);
                  }}
                  style={{
                    paddingVertical: 5,
                    paddingHorizontal: 14,
                    borderRadius: 15,
                    backgroundColor: playbackMode === 'notation' ? '#FF8A00' : 'transparent',
                  }}
                >
                  <Text style={{ color: 'white', fontSize: 11, fontWeight: '700' }}>Sheet Synth</Text>
                </Pressable>
                
                <Pressable
                  onPress={() => {
                    if (playbackMode === 'original') return;
                    isModeSwitchingRef.current = true;
                    modeSwitchingTimeRef.current = Date.now();
                    const targetTime = currentTime;
                    const targetPlaying = isPlaying;
                    if (isPlaying) {
                      const msg = { type: 'PAUSE' };
                      if (Platform.OS === 'web') {
                        const iframe = document.getElementById('record-sheet-music-iframe') as HTMLIFrameElement;
                        if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage(JSON.stringify(msg), '*');
                      } else if (webViewRef.current) webViewRef.current.postMessage(JSON.stringify(msg));
                    }
                    setCurrentTime(targetTime);
                    playerCurrentTimeRef.current = targetTime;
                    setPlaybackMode('original');
                    player.seekTo(targetTime);
                    player.shouldCorrectPitch = true;
                    (player as any).pitchCorrectionQuality = 'high';
                    player.setPlaybackRate(1.0, 'high');
                    if (player.duration) {
                      originalDurationRef.current = player.duration;
                      setDuration(player.duration);
                    } else if (originalDurationRef.current) {
                      setDuration(originalDurationRef.current);
                    }

                    if (targetPlaying) {
                      player.play();
                      isPlayingRef.current = true;
                      setIsPlaying(true);
                    }

                    setTimeout(() => {
                      isModeSwitchingRef.current = false;
                    }, 500);
                  }}
                  style={{
                    paddingVertical: 5,
                    paddingHorizontal: 14,
                    borderRadius: 15,
                    backgroundColor: playbackMode === 'original' ? '#FF8A00' : 'transparent',
                  }}
                >
                  <Text style={{ color: 'white', fontSize: 11, fontWeight: '700' }}>Original Audio</Text>
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
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 26, paddingRight: 4 }}>
                <Animated.View style={[{ width: 4, backgroundColor: '#FF8A00', borderRadius: 4 }, bar1Style]} />
                <Animated.View style={[{ width: 4, backgroundColor: '#FF4FA3', borderRadius: 4 }, bar2Style]} />
                <Animated.View style={[{ width: 4, backgroundColor: '#7B61FF', borderRadius: 4 }, bar3Style]} />
              </View>
            )}
          />
        </GlassCard>
      )}

      {/* Export Options Modal */}
      <Modal
        visible={downloadModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDownloadModalVisible(false)}
      >
        <Pressable 
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={() => setDownloadModalVisible(false)}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: '90%',
              maxWidth: 420,
            }}
          >
            <GlassCard
              style={{
                gap: 16,
              }}
            >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={{ color: 'white', fontSize: 20, fontWeight: '800' }}>Export Workspace</Text>
                <Text style={{ color: '#8e8e93', fontSize: 12, marginTop: 4 }}>Select a format to save or share</Text>
              </View>
              <Pressable
                onPress={() => setDownloadModalVisible(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Ionicons name="close" size={18} color="white" />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {/* Sheet Music Section */}
              <View style={{ gap: 8, marginBottom: 16 }}>
                <Text style={{ color: '#FF8A00', fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>
                  Sheet Music Formats
                </Text>
                
                <Pressable
                  onPress={() => { setDownloadModalVisible(false); handleDownloadPDF(); }}
                  style={({ pressed }) => [styles.exportOptionRow, pressed && styles.exportRowPressed]}
                >
                  <Ionicons name="document-text-outline" size={22} color="#3b82f6" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>PDF Document (.pdf)</Text>
                    <Text style={{ color: '#8e8e93', fontSize: 11 }}>Print-ready paginated sheet music</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="#48484a" />
                </Pressable>

                <Pressable
                  onPress={() => { setDownloadModalVisible(false); handleDownloadMusicXML(); }}
                  style={({ pressed }) => [styles.exportOptionRow, pressed && styles.exportRowPressed]}
                >
                  <Ionicons name="code-working" size={22} color="#10b981" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>MusicXML (.musicxml)</Text>
                    <Text style={{ color: '#8e8e93', fontSize: 11 }}>Industry standard notation format</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="#48484a" />
                </Pressable>

                <Pressable
                  disabled={!projectId}
                  onPress={() => { setDownloadModalVisible(false); handleDownloadMIDI(); }}
                  style={({ pressed }) => [
                    styles.exportOptionRow,
                    !projectId && { opacity: 0.3 },
                    projectId && pressed && styles.exportRowPressed
                  ]}
                >
                  <Ionicons name="musical-notes-outline" size={22} color="#8b5cf6" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>MIDI (.mid)</Text>
                    <Text style={{ color: '#8e8e93', fontSize: 11 }}>Digital notes for DAWs & editors</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="#48484a" />
                </Pressable>
              </View>

              {/* Audio Section */}
              <View style={{ gap: 8, marginBottom: 16 }}>
                <Text style={{ color: '#FF8A00', fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>
                  Audio Formats
                </Text>

                <Pressable
                  onPress={() => { setDownloadModalVisible(false); handleDownloadOriginalAudio(); }}
                  style={({ pressed }) => [styles.exportOptionRow, pressed && styles.exportRowPressed]}
                >
                  <Ionicons name="mic-outline" size={22} color="#ff3b30" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>Original Audio</Text>
                    <Text style={{ color: '#8e8e93', fontSize: 11 }}>Your original recorded/uploaded audio</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="#48484a" />
                </Pressable>

                <Pressable
                  disabled={!projectId}
                  onPress={() => { setDownloadModalVisible(false); handleDownloadPlaybackWAV(); }}
                  style={({ pressed }) => [
                    styles.exportOptionRow,
                    !projectId && { opacity: 0.3 },
                    projectId && pressed && styles.exportRowPressed
                  ]}
                >
                  <Ionicons name="volume-medium-outline" size={22} color="#ec4899" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>Playback Audio (.wav)</Text>
                    <Text style={{ color: '#8e8e93', fontSize: 11 }}>Synthesized piano playback audio</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="#48484a" />
                </Pressable>
              </View>

              {/* Archive Section */}
              <View style={{ gap: 8 }}>
                <Text style={{ color: '#FF8A00', fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>
                  Export Bundle
                </Text>

                <Pressable
                  disabled={!projectId}
                  onPress={() => { setDownloadModalVisible(false); handleDownloadZIP(); }}
                  style={({ pressed }) => [
                    styles.exportOptionRow,
                    !projectId && { opacity: 0.3 },
                    projectId && pressed && styles.exportRowPressed
                  ]}
                >
                  <Ionicons name="archive-outline" size={22} color="#f59e0b" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>Project Archive (.zip)</Text>
                    <Text style={{ color: '#8e8e93', fontSize: 11 }}>Includes XML, PDF, MIDI, original & playback audio</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="#48484a" />
                </Pressable>
              </View>
            </ScrollView>
          </GlassCard>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Global Exporting Overlay */}
      {exportingFormat !== null && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
          }}
        >
          <ActivityIndicator size="large" color="#FF4FA3" />
          <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', marginTop: 20 }}>
            Exporting {exportingFormat}...
          </Text>
          <Text style={{ color: '#8e8e93', fontSize: 13, marginTop: 8 }}>
            Please wait while we prepare your file
          </Text>
        </View>
      )}

      {/* Record Another Audio Modal */}
      <Modal
        visible={showRecordAnotherModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowRecordAnotherModal(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.75)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={() => setShowRecordAnotherModal(false)}
        >
          <GlassCard
            style={{
              width: '85%',
              maxWidth: 380,
              gap: 12,
            }}
          >
            <Text style={{ color: 'white', fontSize: 20, fontWeight: '800' }}>Record Another Audio?</Text>
            <Text style={{ color: '#8e8e93', fontSize: 14, lineHeight: 20 }}>
              Do you want to record and transcribe another audio?
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
              <Pressable
                onPress={() => setShowRecordAnotherModal(false)}
                style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)' }}
              >
                <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>No</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowRecordAnotherModal(false);
                  resetRecordWorkflow();
                }}
                style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#FF8A00' }}
              >
                <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Yes</Text>
              </Pressable>
            </View>
          </GlassCard>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  exportOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 12,
    borderRadius: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
    marginVertical: 4,
  },
  exportRowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
});


