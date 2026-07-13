import { useState, useEffect, useRef, useCallback } from 'react';

import CreateScreen from './create';
import TranscriptionQualityCard, { QualityScores } from '@/components/TranscriptionQualityCard';
import PlaybackController from '@/components/PlaybackController';
import MusicLoadingAnimation from '@/components/MusicLoadingAnimation';
import { GradientBackground, GlassCard, PrimaryButton, SecondaryButton, LoadingAnimation } from '@/components/ui/DesignSystem';
import { WalkthroughRegistry } from '@/components/onboarding/WalkthroughRegistry';

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
  StyleSheet,
  BackHandler,
  AppState,
  Dimensions
} from 'react-native';

import { EducationalTipsRotator } from '@/components/onboarding/EducationalTipsRotator';

const { height: H } = Dimensions.get('window');

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
import { useSettings } from '@/context/SettingsContext';
import { sendLocalNotification } from '@/utils/notifications';
import { saveLatestConversion, loadLatestConversion, clearLatestConversion } from '@/utils/storage';
import * as FileSystem from 'expo-file-system/legacy';
import { useConversion } from '@/context/ConversionContext';
import { File as ExpoFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';

import { Ionicons } from '@expo/vector-icons';

import { LinearGradient } from 'expo-linear-gradient';

interface ProcessStepProps {
  label: string;
  icon: string;
  status: 'pending' | 'active' | 'completed';
}

function ProcessStep({ label, icon, status }: ProcessStepProps) {
  const { theme } = useSettings();
  const isDark = theme === 'dark';
  
  const getColors = () => {
    switch (status) {
      case 'completed':
        return { text: isDark ? '#FFFFFF' : '#121212', iconColor: '#34C759', opacity: 1 };
      case 'active':
        return { text: '#FF4FA3', iconColor: '#FF4FA3', opacity: 1 };
      default:
        return { text: isDark ? '#8E929A' : '#60646C', iconColor: isDark ? '#8E929A' : '#60646C', opacity: 0.5 };
    }
  };

  const colors = getColors();

  return (
    <View style={[styles.stepRow, { opacity: colors.opacity }]}>
      <View style={styles.stepIconWrapper}>
        {status === 'completed' ? (
          <Ionicons name="checkmark-circle" size={24} color="#34C759" />
        ) : status === 'active' ? (
          <ActivityIndicator size="small" color="#FF4FA3" />
        ) : (
          <Ionicons name="ellipse-outline" size={20} color={colors.iconColor} />
        )}
      </View>
      <View style={styles.stepInfo}>
        <Ionicons name={icon as any} size={18} color={colors.iconColor} style={{ marginRight: 8 }} />
        <Text style={[styles.stepText, { color: colors.text }]}>{label}</Text>
      </View>
    </View>
  );
}

// Module-level cache to persist Record screen state across tab switching (unmounts)
let lastActiveRecordState: any = null;

export default function RecordScreen() {
  const params = useLocalSearchParams<{ loadProjectId?: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const webViewRef = useRef<any>(null);
  const isRestored = useRef(false);

  const BACKEND_URL = 'http://192.168.1.4:5001';

  const [projectId, setProjectId] = useState<string | null>(null);

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

  const { theme, inAppVolumeEnabled, inAppVolume } = useSettings();
  const isDark = theme === 'dark';

  const { activeConversions, startAudioTranscription, clearConversion, cancelConversion } = useConversion();
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [isStateLoaded, setIsStateLoaded] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    
    const handleBackButton = () => {
      if (isConverting) {
        setShowDiscardModal(true);
        return true; // prevent default back action
      }
      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackButton);
    return () => subscription.remove();
  }, [isConverting]);

  useEffect(() => {
    if (player) {
      player.volume = inAppVolumeEnabled ? inAppVolume : 0.0;
    }
  }, [player, inAppVolume, inAppVolumeEnabled]);

  // Check if there is an active running transcription task for the current recording
  useEffect(() => {
    if (recordingURI) {
      const runningTask = Object.values(activeConversions).find(
        task => task.type === 'transcription' && task.inputUri === recordingURI
      );
      if (runningTask) {
        setRunningTaskId(runningTask.id);
        setIsConverting(runningTask.status === 'running');
      }
    }
  }, [recordingURI, activeConversions]);

  // Watch the active task for status transitions
  useEffect(() => {
    if (runningTaskId && activeConversions[runningTaskId]) {
      const task = activeConversions[runningTaskId];
      setIsConverting(task.status === 'running');
      
      if (task.status === 'completed' && task.resultData) {
        const { projectId: newProjectId, convertedNotes: notesToStore, timeSignature: sig, detectedTempo: tempo, musicXML: xml, qualityScores: scores, rawNoteEvents: rawEvents } = task.resultData;
        
        setProjectId(newProjectId);
        setConvertedNotes(notesToStore);
        setTimeSignature(sig);
        setDetectedTempo(tempo);
        setMusicXML(xml);
        setQualityScores(scores);
        setRawNoteEvents(rawEvents);
        
        setCameFromProjects(false);
        setShowSheet(true);
        setShowDiscardModal(false);
        
        clearConversion(runningTaskId);
        setRunningTaskId(null);
      } else if (task.status === 'failed') {
        resetConvertedSheet();
        clearConversion(runningTaskId);
        setRunningTaskId(null);
      }
    }
  }, [runningTaskId, activeConversions]);

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


  // Effect to  // Load project details if navigate options are used
  useEffect(() => {
    async function loadProject() {
      if (params.loadProjectId) {
        // Clear cached state since we're opening a project
        lastActiveRecordState = null;
        if (Platform.OS === 'web') {
          try {
            const projectStr = localStorage.getItem('melonote_project_' + params.loadProjectId);
            if (projectStr) {
              const project = JSON.parse(projectStr);
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
              setIsStateLoaded(true);
              router.setParams({ loadProjectId: undefined });
            } else {
              Alert.alert('Error', 'Project not found in local storage.');
              setIsStateLoaded(true);
            }
          } catch (e) {
            console.error('[loadProject Web] Error:', e);
            setIsStateLoaded(true);
          }
          return;
        }

        try {
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
            setIsStateLoaded(true);
            
            // Clear route params so it doesn't reload on every mount/refresh
            router.setParams({ loadProjectId: undefined });
          } else {
            Alert.alert('Error', 'Project file does not exist.');
            setIsStateLoaded(true);
          }
        } catch (err) {
          console.error('[loadProject] Error:', err);
          Alert.alert('Error', 'Could not load the project.');
          setIsStateLoaded(true);
        }
      }
    }
    loadProject();
  }, [params.loadProjectId]);


  const restoreState = useCallback(async () => {
    if (params.loadProjectId) return;
    
    let state = lastActiveRecordState;
    if (!state) {
      state = await loadLatestConversion('transcription');
    }
    
    if (state) {
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

      // Check if there is an active running transcription task for this restored recording
      if (state.recordingURI) {
        const runningTask = Object.values(activeConversions).find(
          task => task.type === 'transcription' && task.inputUri === state.recordingURI
        );
        if (runningTask) {
          if (runningTask.status === 'completed' && runningTask.resultData) {
            const { projectId: newProjectId, convertedNotes: notesToStore, timeSignature: sig, detectedTempo: tempo, musicXML: xml, qualityScores: scores, rawNoteEvents: rawEvents } = runningTask.resultData;
            setProjectId(newProjectId);
            setConvertedNotes(notesToStore);
            setTimeSignature(sig);
            setDetectedTempo(tempo);
            setMusicXML(xml);
            setQualityScores(scores);
            setRawNoteEvents(rawEvents);
            setCameFromProjects(false);
            setShowSheet(true);
            setIsConverting(false);
            clearConversion(runningTask.id);
          } else {
            setRunningTaskId(runningTask.id);
            setIsConverting(runningTask.status === 'running');
          }
        } else {
          setIsConverting(false);
        }
      }
    } else {
      setIsConverting(false);
    }
    isRestored.current = true;
    setIsStateLoaded(true);
  }, [params.loadProjectId, activeConversions]);

  const restoreStateRef = useRef(restoreState);
  useEffect(() => {
    restoreStateRef.current = restoreState;
  }, [restoreState]);

  const isConvertingRef = useRef(isConverting);
  useEffect(() => {
    isConvertingRef.current = isConverting;
  }, [isConverting]);

  // Focus, Blur, AppState listeners to trigger state restoration smoothly
  useEffect(() => {
    restoreStateRef.current();

    const unsubscribeFocus = navigation.addListener('focus', () => {
      restoreStateRef.current();
    });

    const unsubscribeBlur = navigation.addListener('blur', () => {
      if (isConvertingRef.current) {
        setIsStateLoaded(false);
      }
    });

    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        restoreStateRef.current();
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        if (isConvertingRef.current) {
          setIsStateLoaded(false);
        }
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
      subscription.remove();
    };
  }, [navigation]);

  // Save/clear active record session state in module-level cache and storage
  useEffect(() => {
    if (!isRestored.current) return;
    if (recordingURI || showSheet) {
      const stateObj = {
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
      lastActiveRecordState = stateObj;
      saveLatestConversion('transcription', stateObj);
    } else {
      lastActiveRecordState = null;
      clearLatestConversion('transcription');
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
      sendLocalNotification("Transcription Started", "Analyzing audio and generating sheet music...");

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

      const size = audioInfo?.size || 0;
      const evaluatedDuration = player?.duration || duration || seconds || 0;

      const activeId = await startAudioTranscription(
        recordingURI,
        fileName,
        monophonic,
        evaluatedDuration,
        seconds || 0,
        size,
        nativeAudioFile,
        BACKEND_URL
      );
      setRunningTaskId(activeId);

    } catch (err) {
      if (isDiscardedRef.current) return;
      console.log('Convert Error:');
      console.log(err);
      sendLocalNotification("Audio transcription failed.", "Please try again.");
      setIsConverting(false);
    }
  }

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
      handlePlaybackMessage(data);
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
          // Use ref so listener always calls the latest version of the handler
          handlePlaybackMessageRef.current(data);
        } catch (e) {
          // Ignore non-JSON or unrelated messages
        }
      };
      window.addEventListener('message', handleWebMessage);
      return () => window.removeEventListener('message', handleWebMessage);
    }
    // Intentionally only register once per mount — ref ensures latest handler is always called
  }, [projectId]);





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

  if (!isStateLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: isDark ? '#050507' : '#FFFFFF', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FF8A00" />
      </View>
    );
  }

  if (isConverting) {
    const task = runningTaskId ? activeConversions[runningTaskId] : null;
    const statusStep = task?.statusStep ?? 0;

    return (
      <View style={{ flex: 1, backgroundColor: isDark ? '#050507' : '#FFFFFF' }}>
        <LinearGradient colors={isDark ? ['#0F0F12', '#050507'] : ['#F9F9FA', '#F0F0F3']} style={StyleSheet.absoluteFill} />
        
        {/* Header Bar */}
        <View style={{ height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)', zIndex: 10 }}>
          <Pressable
            onPress={() => setShowDiscardModal(true)}
            style={({ pressed }) => ({
              padding: 8,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="arrow-back" size={24} color={isDark ? 'white' : '#121212'} />
          </Pressable>
          <Text style={{ color: isDark ? 'white' : '#121212', fontSize: 16, fontWeight: '700' }}>Converting Score</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={StyleSheet.absoluteFill}>
          <MusicLoadingAnimation showText={false} />
        </View>

        <View style={{ flex: 1, justifyContent: 'center', padding: 20, gap: 16, zIndex: 1 }}>
          {/* Progress Steps Card */}
          <GlassCard style={StyleSheet.flatten([styles.stepsCard, { backgroundColor: isDark ? 'rgba(20, 20, 25, 0.4)' : 'rgba(255, 255, 255, 0.4)' }])}>
            <ProcessStep
              label="Receiving Audio"
              icon="cloud-upload-outline"
              status={statusStep === 0 ? 'active' : statusStep > 0 ? 'completed' : 'pending'}
            />
            <ProcessStep
              label="Cleaning & Preprocessing Audio"
              icon="pulse-outline"
              status={statusStep === 1 ? 'active' : statusStep > 1 ? 'completed' : 'pending'}
            />
            <ProcessStep
              label="Detecting Notes, Pitch & Rhythm"
              icon="musical-notes-outline"
              status={statusStep === 2 ? 'active' : statusStep > 2 ? 'completed' : 'pending'}
            />
            <ProcessStep
              label="Generating MusicXML"
              icon="code-working-outline"
              status={statusStep === 3 ? 'active' : statusStep > 3 ? 'completed' : 'pending'}
            />
            <ProcessStep
              label="Rendering Final Music Sheet"
              icon="sparkles-outline"
              status={statusStep === 4 ? 'active' : 'pending'}
            />
          </GlassCard>

          {/* Tips Rotator */}
          <EducationalTipsRotator />
        </View>

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
                backgroundColor: isDark ? '#16161A' : '#FFFFFF',
                borderRadius: 24,
                padding: 24,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
              }}
            >
              <Text style={{ color: isDark ? 'white' : '#121212', fontSize: 20, fontWeight: '800', marginBottom: 8 }}>
                Discard Conversion?
              </Text>
              <Text style={{ color: isDark ? '#8e8e93' : '#60646C', fontSize: 14, lineHeight: 20, marginBottom: 24 }}>
                Do you wish to discard conversion? The audio analysis will be cancelled.
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
                <Pressable
                  onPress={() => setShowDiscardModal(false)}
                  style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}
                >
                  <Text style={{ color: isDark ? 'white' : '#121212', fontWeight: '600', fontSize: 14 }}>No</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    isDiscardedRef.current = true;
                    setIsConverting(false);
                    setShowDiscardModal(false);
                    if (runningTaskId) {
                      cancelConversion(runningTaskId);
                      setRunningTaskId(null);
                    }
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
    <View style={{ flex: 1, backgroundColor: isDark ? '#050507' : '#FFFFFF' }}>
      <LinearGradient colors={isDark ? ['#0F0F12', '#050507'] : ['#F9F9FA', '#F0F0F3']} style={StyleSheet.absoluteFill} />
      
      {!showSheet ? (
        <ScrollView
          ref={(r) => WalkthroughRegistry.register('active-scrollview', r)}
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
                  <Text numberOfLines={1} style={{ color: isDark ? 'white' : '#121212', fontSize: 16, fontWeight: '700', maxWidth: 240 }}>
                    {audioInfo.name}
                  </Text>
                  <Text style={{ color: isDark ? '#8E929A' : '#60646C', fontSize: 13, marginTop: 4 }}>
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
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Ionicons name="close" size={18} color={isDark ? '#FFFFFF' : '#121212'} />
                </Pressable>
              </>
            ) : (
              <>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="mic-outline" size={28} color="#FF8A00" />
                </View>
                <Text style={{ color: isDark ? '#8E929A' : '#60646C', fontSize: 14, fontWeight: '600', textAlign: 'center', paddingHorizontal: 30 }}>
                  Record a melody or upload an audio file to transcribe
                </Text>
              </>
            )}
          </GlassCard>

          {/* Dotted Upload Card (when there is no recording yet) */}
          {recordingURI === '' && !isRecording && (
            <GlassCard style={{ padding: 10, height: 140 }}>
              <Pressable
                ref={(r) => WalkthroughRegistry.register('record-upload', r)}
                onPress={pickAudioFile}
                style={({ pressed }) => [
                  { flex: 1, borderWidth: 2, borderColor: 'rgba(255, 79, 163, 0.12)', borderStyle: 'dashed', borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 6 },
                  pressed && { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)' }
                ]}
              >
                <Ionicons name="cloud-upload-outline" size={32} color="#FF4FA3" style={{ marginBottom: 4 }} />
                <Text style={{ color: isDark ? '#FFFFFF' : '#121212', fontSize: 14, fontWeight: '600' }}>Upload audio file</Text>
                <Text style={{ color: isDark ? '#8E929A' : '#60646C', fontSize: 11 }}>Supports WAV, MP3, M4A up to 20MB</Text>
              </Pressable>
            </GlassCard>
          )}

          {/* Large Spotify-inspired Record Button Area */}
          {recordingURI === '' && (
            <View style={{ alignItems: 'center', justifyContent: 'center', marginVertical: 10 }}>
              <Pressable
                ref={(r) => WalkthroughRegistry.register('record-btn', r)}
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
              <Text style={{ color: isDark ? '#B0B4BA' : '#60646C', fontSize: 13, fontWeight: '700', marginTop: 14, letterSpacing: 0.5 }}>
                {isRecording ? 'TAP TO STOP' : 'TAP TO RECORD'}
              </Text>
            </View>
          )}

          {/* Convert Actions (when recording is finished) */}
          {!isRecording && recordingURI !== '' && (
            <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
              <PrimaryButton
                ref={(r) => WalkthroughRegistry.register('record-convert', r)}
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
            <Text style={{ color: isDark ? 'white' : '#121212', fontSize: 20, fontWeight: '800' }}>Remove Audio</Text>
            <Text style={{ color: isDark ? '#8e8e93' : '#60646C', fontSize: 14, lineHeight: 20 }}>
              Are you sure you want to remove this audio?
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
              <Pressable
                onPress={() => setRemoveModalVisible(false)}
                style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}
              >
                <Text style={{ color: isDark ? 'white' : '#121212', fontWeight: '600', fontSize: 14 }}>Cancel</Text>
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
      {recordingURI !== '' && !showSheet && (
        <GlassCard
          style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            right: 20,
            padding: 12,
            borderRadius: 24,
            borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
            zIndex: 900,
          }}
        >
          {showSheet && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderRadius: 20, padding: 3, gap: 4 }}>
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
                  <Text style={{ color: isDark ? 'white' : '#121212', fontSize: 11, fontWeight: '700' }}>Sheet Synth</Text>
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
                  <Text style={{ color: isDark ? 'white' : '#121212', fontSize: 11, fontWeight: '700' }}>Original Audio</Text>
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
          />
        </GlassCard>
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
            <Text style={{ color: isDark ? 'white' : '#121212', fontSize: 20, fontWeight: '800' }}>Record Another Audio?</Text>
            <Text style={{ color: isDark ? '#8e8e93' : '#60646C', fontSize: 14, lineHeight: 20 }}>
              Do you want to record and transcribe another audio?
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
              <Pressable
                onPress={() => setShowRecordAnotherModal(false)}
                style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}
              >
                <Text style={{ color: isDark ? 'white' : '#121212', fontWeight: '600', fontSize: 14 }}>No</Text>
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
  stepsCard: {
    padding: 16,
    gap: 12,
    borderRadius: 24,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
  },
  stepIconWrapper: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  stepText: {
    fontSize: 14,
    fontWeight: '600',
  },
});


