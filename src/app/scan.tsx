import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { StyleSheet, View, Text, ScrollView, Image, ActivityIndicator, Alert, Platform, Pressable, PanResponder, useWindowDimensions, Modal, BackHandler, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect, Path, Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, Camera } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { uploadAsync, FileSystemUploadType, documentDirectory, makeDirectoryAsync, copyAsync } from 'expo-file-system/legacy';

// Import design system & sheet editor
import { GradientBackground, GlassCard, PrimaryButton, SecondaryButton } from '@/components/ui/DesignSystem';
import CreateScreen from './create';
import { sendLocalNotification } from '@/utils/notifications';
import { saveLatestConversion, loadLatestConversion, clearLatestConversion } from '@/utils/storage';
import { useSettings } from '@/context/SettingsContext';
import { useConversion } from '@/context/ConversionContext';
import { useNavigation } from 'expo-router';
import { WalkthroughRegistry } from '@/components/onboarding/WalkthroughRegistry';
import { EducationalTipsRotator } from '@/components/onboarding/EducationalTipsRotator';

const BACKEND_URL = 'http://192.168.1.4:5001';

const ScanIllustration = () => {
  const { theme } = useSettings();
  const isDark = theme === 'dark';
  const strokeColor = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';
  const stopColor1 = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.05)';
  const stopColor2 = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)';

  return (
    <Svg viewBox="0 0 200 160" width={200} height={160}>
      <Defs>
        <LinearGradient id="sheetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={stopColor1} />
          <Stop offset="100%" stopColor={stopColor2} />
        </LinearGradient>
        <LinearGradient id="laserGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#FF8A00" stopOpacity="0.8" />
          <Stop offset="50%" stopColor="#FF4FA3" stopOpacity="0.8" />
          <Stop offset="100%" stopColor="#7B61FF" stopOpacity="0.8" />
        </LinearGradient>
      </Defs>
      
      <Line x1="60" y1="85" x2="140" y2="85" stroke={strokeColor} strokeWidth="1.5" />
      <Line x1="60" y1="95" x2="140" y2="95" stroke={strokeColor} strokeWidth="1.5" />
      <Line x1="60" y1="105" x2="140" y2="105" stroke={strokeColor} strokeWidth="1.5" />

      <Path d="M70,35 C70,45 80,45 80,35" fill="none" stroke="#FF4FA3" strokeWidth="2" />
      <Path d="M75,30 L75,70" fill="none" stroke="#FF4FA3" strokeWidth="2" />

      <Circle cx="95" cy="55" r="4" fill="#7B61FF" />
      <Line x1="99" y1="55" x2="99" y2="40" stroke="#7B61FF" strokeWidth="1.5" />
      
      <Circle cx="120" cy="65" r="4" fill="#FF8A00" />
      <Line x1="124" y1="65" x2="124" y2="50" stroke="#FF8A00" strokeWidth="1.5" />

      <Rect x="40" y="72" width="120" height="4" rx="2" fill="url(#laserGrad)" />
      <Path d="M 50,74 L 50,110 M 70,74 L 70,110 M 90,74 L 90,110 M 110,74 L 110,110 M 130,74 L 130,110 M 150,74 L 150,110" stroke={isDark ? "rgba(123, 97, 255, 0.2)" : "rgba(123, 97, 255, 0.15)"} strokeWidth="1" strokeDasharray="3,3" />
    </Svg>
  );
};

interface ProcessStepProps {
  label: string;
  icon: string;
  status: 'pending' | 'active' | 'completed';
}

const ProcessStep: React.FC<ProcessStepProps> = ({ label, icon, status }) => {
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
};

const mapOverlayToImageCrop = (
  overlayX: number,
  overlayY: number,
  overlayWidth: number,
  overlayHeight: number,
  screenWidth: number,
  screenHeight: number,
  imgWidth: number,
  imgHeight: number
) => {
  const screenRatio = screenHeight / screenWidth;
  const imgRatio = imgHeight / imgWidth;

  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  if (imgRatio > screenRatio) {
    scale = imgWidth / screenWidth;
    offsetY = (imgHeight - screenHeight * scale) / 2;
  } else {
    scale = imgHeight / screenHeight;
    offsetX = (imgWidth - screenWidth * scale) / 2;
  }

  const cropX = Math.max(0, Math.round(overlayX * scale + offsetX));
  const cropY = Math.max(0, Math.round(overlayY * scale + offsetY));
  const cropWidth = Math.min(imgWidth - cropX, Math.round(overlayWidth * scale));
  const cropHeight = Math.min(imgHeight - cropY, Math.round(overlayHeight * scale));

  return {
    originX: cropX,
    originY: cropY,
    width: cropWidth,
    height: cropHeight
  };
};

const cropPercentageToPixels = (
  cropTop: number,
  cropBottom: number,
  cropLeft: number,
  cropRight: number,
  imgWidth: number,
  imgHeight: number
) => {
  const originX = Math.round((cropLeft / 100) * imgWidth);
  const originY = Math.round((cropTop / 100) * imgHeight);
  const width = Math.round(((100 - cropLeft - cropRight) / 100) * imgWidth);
  const height = Math.round(((100 - cropTop - cropBottom) / 100) * imgHeight);

  return {
    originX: Math.max(0, originX),
    originY: Math.max(0, originY),
    width: Math.min(imgWidth - originX, Math.max(1, width)),
    height: Math.min(imgHeight - originY, Math.max(1, height))
  };
};

export default function ScanSheetScreen() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { theme } = useSettings();
  const isDark = theme === 'dark';

  const { activeConversions, startSheetScan, clearConversion, cancelConversion } = useConversion();
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const navigation = useNavigation();
  const [isStateLoaded, setIsStateLoaded] = useState(false);

  const [imageTitle, setImageTitle] = useState<string>('captured_score.jpg');
  const [croppedImageUri, setCroppedImageUri] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'dashboard' | 'confirm' | 'loading' | 'camera'>('dashboard');

  useEffect(() => {
    if (Platform.OS === 'web') return;
    
    const handleBackButton = () => {
      if (viewMode === 'loading') {
        setShowDiscardModal(true);
        return true; // prevent default back action
      }
      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackButton);
    return () => subscription.remove();
  }, [viewMode]);

  const [statusStep, setStatusStep] = useState<number>(0);
  const [showSheet, setShowSheet] = useState<boolean>(false);
  const [musicxml, setMusicxml] = useState<string | null>(null);
  const [loadingWarning, setLoadingWarning] = useState<string>('');

  const [cropTop, setCropTop] = useState(0);
  const [cropBottom, setCropBottom] = useState(0);
  const [cropLeft, setCropLeft] = useState(0);
  const [cropRight, setCropRight] = useState(0);

  const [imageLayout, setImageLayout] = useState({ width: 0, height: 0 });
  const [cameraLayout, setCameraLayout] = useState({ width: 0, height: 0 });
  const [guideLayout, setGuideLayout] = useState({ x: 24, y: 150, width: 327, height: 436 });

  const pollingIntervalRef = useRef<any>(null);
  const isRestored = useRef(false);
  const cameraRef = useRef<CameraView>(null);
  const [isTakingPicture, setIsTakingPicture] = useState(false);

  const cropTopRef = useRef(0);
  const cropBottomRef = useRef(0);
  const cropLeftRef = useRef(0);
  const cropRightRef = useRef(0);

  // Sync refs on every render
  cropTopRef.current = cropTop;
  cropBottomRef.current = cropBottom;
  cropLeftRef.current = cropLeft;
  cropRightRef.current = cropRight;

  const startLeftRef = useRef(0);
  const startTopRef = useRef(0);
  const startRightRef = useRef(0);
  const startBottomRef = useRef(0);

  const panTL = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => {
          console.log('[crop-gesture-TL] onStartShouldSetPanResponder fired');
          return true;
        },
        onPanResponderGrant: () => {
          console.log('[crop-gesture-TL] onPanResponderGrant fired. Current values:', {
            cropLeft: cropLeftRef.current,
            cropTop: cropTopRef.current,
            imageLayoutWidth: imageLayout.width,
            imageLayoutHeight: imageLayout.height
          });
          startLeftRef.current = cropLeftRef.current;
          startTopRef.current = cropTopRef.current;
        },
        onPanResponderMove: (evt, gestureState) => {
          console.log('[crop-gesture-TL] onPanResponderMove fired. dx:', gestureState.dx, 'dy:', gestureState.dy, 'imageLayout:', imageLayout);
          if (!imageLayout.width || !imageLayout.height) {
            console.log('[crop-gesture-TL] onPanResponderMove early exit: imageLayout is 0 or undefined');
            return;
          }
          const dxPct = (gestureState.dx / imageLayout.width) * 100;
          const dyPct = (gestureState.dy / imageLayout.height) * 100;
          setCropLeft(Math.min(100 - cropRightRef.current - 15, Math.max(0, startLeftRef.current + dxPct)));
          setCropTop(Math.min(100 - cropBottomRef.current - 15, Math.max(0, startTopRef.current + dyPct)));
        }
      }),
    [imageLayout.width, imageLayout.height]
  );

  const panTR = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => {
          console.log('[crop-gesture-TR] onStartShouldSetPanResponder fired');
          return true;
        },
        onPanResponderGrant: () => {
          console.log('[crop-gesture-TR] onPanResponderGrant fired. Current values:', {
            cropRight: cropRightRef.current,
            cropTop: cropTopRef.current,
            imageLayoutWidth: imageLayout.width,
            imageLayoutHeight: imageLayout.height
          });
          startRightRef.current = cropRightRef.current;
          startTopRef.current = cropTopRef.current;
        },
        onPanResponderMove: (evt, gestureState) => {
          console.log('[crop-gesture-TR] onPanResponderMove fired. dx:', gestureState.dx, 'dy:', gestureState.dy, 'imageLayout:', imageLayout);
          if (!imageLayout.width || !imageLayout.height) {
            console.log('[crop-gesture-TR] onPanResponderMove early exit: imageLayout is 0 or undefined');
            return;
          }
          const dxPct = (gestureState.dx / imageLayout.width) * 100;
          const dyPct = (gestureState.dy / imageLayout.height) * 100;
          setCropRight(Math.min(100 - cropLeftRef.current - 15, Math.max(0, startRightRef.current - dxPct)));
          setCropTop(Math.min(100 - cropBottomRef.current - 15, Math.max(0, startTopRef.current + dyPct)));
        }
      }),
    [imageLayout.width, imageLayout.height]
  );

  const panBL = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => {
          console.log('[crop-gesture-BL] onStartShouldSetPanResponder fired');
          return true;
        },
        onPanResponderGrant: () => {
          console.log('[crop-gesture-BL] onPanResponderGrant fired. Current values:', {
            cropLeft: cropLeftRef.current,
            cropBottom: cropBottomRef.current,
            imageLayoutWidth: imageLayout.width,
            imageLayoutHeight: imageLayout.height
          });
          startLeftRef.current = cropLeftRef.current;
          startBottomRef.current = cropBottomRef.current;
        },
        onPanResponderMove: (evt, gestureState) => {
          console.log('[crop-gesture-BL] onPanResponderMove fired. dx:', gestureState.dx, 'dy:', gestureState.dy, 'imageLayout:', imageLayout);
          if (!imageLayout.width || !imageLayout.height) {
            console.log('[crop-gesture-BL] onPanResponderMove early exit: imageLayout is 0 or undefined');
            return;
          }
          const dxPct = (gestureState.dx / imageLayout.width) * 100;
          const dyPct = (gestureState.dy / imageLayout.height) * 100;
          setCropLeft(Math.min(100 - cropRightRef.current - 15, Math.max(0, startLeftRef.current + dxPct)));
          setCropBottom(Math.min(100 - cropTopRef.current - 15, Math.max(0, startBottomRef.current - dyPct)));
        }
      }),
    [imageLayout.width, imageLayout.height]
  );

  const panBR = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => {
          console.log('[crop-gesture-BR] onStartShouldSetPanResponder fired');
          return true;
        },
        onPanResponderGrant: () => {
          console.log('[crop-gesture-BR] onPanResponderGrant fired. Current values:', {
            cropRight: cropRightRef.current,
            cropBottom: cropBottomRef.current,
            imageLayoutWidth: imageLayout.width,
            imageLayoutHeight: imageLayout.height
          });
          startRightRef.current = cropRightRef.current;
          startBottomRef.current = cropBottomRef.current;
        },
        onPanResponderMove: (evt, gestureState) => {
          console.log('[crop-gesture-BR] onPanResponderMove fired. dx:', gestureState.dx, 'dy:', gestureState.dy, 'imageLayout:', imageLayout);
          if (!imageLayout.width || !imageLayout.height) {
            console.log('[crop-gesture-BR] onPanResponderMove early exit: imageLayout is 0 or undefined');
            return;
          }
          const dxPct = (gestureState.dx / imageLayout.width) * 100;
          const dyPct = (gestureState.dy / imageLayout.height) * 100;
          setCropRight(Math.min(100 - cropLeftRef.current - 15, Math.max(0, startRightRef.current - dxPct)));
          setCropBottom(Math.min(100 - cropTopRef.current - 15, Math.max(0, startBottomRef.current - dyPct)));
        }
      }),
    [imageLayout.width, imageLayout.height]
  );

  const loadLatest = useCallback(async () => {
    try {
      const latest = await loadLatestConversion('scan');
      if (latest) {
        setCroppedImageUri(latest.croppedImageUri || null);
        setImageTitle(latest.imageTitle || 'captured_score.jpg');
        setMusicxml(latest.musicxml || null);
        setShowSheet(latest.showSheet || false);

        // Check if there is an active running/completed task in activeConversions
        const runningTask = Object.values(activeConversions).find(
          task => task.type === 'scan' && task.inputUri === latest.croppedImageUri
        );
        if (runningTask) {
          if (runningTask.status === 'completed' && runningTask.resultMusicXML) {
            setMusicxml(runningTask.resultMusicXML);
            setStatusStep(4);
            setViewMode('dashboard');
            setShowSheet(true);
            clearConversion(runningTask.id);
            setRunningTaskId(null);
          } else {
            setRunningTaskId(runningTask.id);
            setViewMode(runningTask.status === 'running' ? 'loading' : 'dashboard');
            setStatusStep(runningTask.statusStep || 0);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load latest scan conversion state:', err);
    }
    isRestored.current = true;
    setIsStateLoaded(true);
  }, [activeConversions]);

  const loadLatestRef = useRef(loadLatest);
  useEffect(() => {
    loadLatestRef.current = loadLatest;
  }, [loadLatest]);

  const viewModeRef = useRef(viewMode);
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  // Focus, Blur, AppState listeners to trigger state restoration smoothly
  useEffect(() => {
    loadLatestRef.current();

    const unsubscribeFocus = navigation.addListener('focus', () => {
      loadLatestRef.current();
    });

    const unsubscribeBlur = navigation.addListener('blur', () => {
      if (viewModeRef.current === 'loading') {
        setIsStateLoaded(false);
      }
    });

    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        loadLatestRef.current();
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        if (viewModeRef.current === 'loading') {
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

  // Watch active scan task state
  useEffect(() => {
    if (runningTaskId && activeConversions[runningTaskId]) {
      const task = activeConversions[runningTaskId];
      
      if (task.status === 'running') {
        setViewMode('loading');
        setStatusStep(task.statusStep || 0);
      } else if (task.status === 'completed' && task.resultMusicXML) {
        setMusicxml(task.resultMusicXML);
        setStatusStep(4);
        if (task.inputUri) {
          setCroppedImageUri(task.inputUri);
        }
        
        const openEditor = () => {
          setViewMode('dashboard');
          setShowSheet(true);
          setLoadingWarning('');
          clearConversion(runningTaskId);
          setRunningTaskId(null);
        };
        setTimeout(openEditor, 1200);
      } else if (task.status === 'failed') {
        setViewMode('confirm');
        setLoadingWarning('');
        clearConversion(runningTaskId);
        setRunningTaskId(null);
      }
    }
  }, [runningTaskId, activeConversions]);

  // Save scan state to storage on changes
  useEffect(() => {
    if (!isRestored.current) return;
    if (musicxml || showSheet || croppedImageUri) {
      saveLatestConversion('scan', {
        croppedImageUri,
        imageTitle,
        musicxml,
        showSheet,
      });
    } else {
      clearLatestConversion('scan');
    }
  }, [croppedImageUri, imageTitle, musicxml, showSheet]);

  useEffect(() => {
    if (viewMode === 'confirm') {
      console.log('Preview screen opened');
    }
  }, [viewMode]);

  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const cameraStatus = await Camera.requestCameraPermissionsAsync();
      const libraryStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (cameraStatus.status !== 'granted' || libraryStatus.status !== 'granted') {
        Alert.alert('Permissions Required', 'Camera and gallery access permissions are required to scan sheet music.');
        return false;
      }
    }
    return true;
  };

  const handleScanWithCamera = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    console.log('Camera opened');
    setViewMode('camera');
  };

  const takePicture = async () => {
    if (!cameraRef.current || isTakingPicture) return;
    setIsTakingPicture(true);
    console.log('Picture capture initiated');
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        exif: true,
        skipProcessing: false,
      });
      console.log('Picture captured');
      console.log('Image URI received:', photo.uri);

      if (photo.width && photo.height) {
        console.log(`Raw photo dimensions: ${photo.width}x${photo.height}`);
      }

      const screenWidth = cameraLayout.width || windowWidth;
      const screenHeight = cameraLayout.height || windowHeight;

      // 1. Check for orientation mismatch (screen vs photo aspect ratio) and normalize if necessary
      let normalizedPhoto = photo;
      const isScreenPortrait = screenHeight > screenWidth;
      const isPhotoPortrait = photo.height > photo.width;

      if (isScreenPortrait !== isPhotoPortrait) {
        console.log(`[camera] Orientation mismatch detected. screenPortrait=${isScreenPortrait}, photoPortrait=${isPhotoPortrait}. Rotating image 90 degrees to align...`);
        const rotated = await ImageManipulator.manipulateAsync(
          photo.uri,
          [{ rotate: 90 }],
          { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
        );
        normalizedPhoto = {
          ...photo,
          uri: rotated.uri,
          width: rotated.width,
          height: rotated.height
        };
        console.log(`[camera] Normalized photo dimensions: ${normalizedPhoto.width}x${normalizedPhoto.height}`);
      }

      // 2. Use the dynamically measured guide layout coordinates
      const guideX = guideLayout.x;
      const guideY = guideLayout.y;
      const guideWidth = guideLayout.width;
      const guideHeight = guideLayout.height;

      // 3. Map overlay coordinates to normalized image pixel coordinates
      const cropRegion = mapOverlayToImageCrop(
        guideX,
        guideY,
        guideWidth,
        guideHeight,
        screenWidth,
        screenHeight,
        normalizedPhoto.width,
        normalizedPhoto.height
      );

      // 4. Output verbose debug logs as required
      console.log('=== CAMERA COORDINATE MAPPING DEBUG ===');
      console.log(`Screen Size (Window): ${windowWidth}x${windowHeight}`);
      console.log(`Preview Size (Layout): ${screenWidth}x${screenHeight}`);
      console.log(`Captured Image Size (Raw): ${photo.width}x${photo.height}`);
      console.log(`Normalized Image Size (Rotated): ${normalizedPhoto.width}x${normalizedPhoto.height}`);
      console.log(`Overlay Rectangle (Guide): x=${guideX}, y=${guideY}, w=${guideWidth}, h=${guideHeight}`);
      console.log(`Calculated Crop Rectangle: originX=${cropRegion.originX}, originY=${cropRegion.originY}, w=${cropRegion.width}, h=${cropRegion.height}`);

      // 5. Perform automatic crop
      console.log('Auto-cropping captured photo to guide overlay region...');
      const cropResult = await ImageManipulator.manipulateAsync(
        normalizedPhoto.uri,
        [{ crop: cropRegion }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );

      console.log('Auto-cropped image dimensions:', cropResult.width, 'x', cropResult.height);
      console.log('Final Crop Rectangle (Result):', { width: cropResult.width, height: cropResult.height, uri: cropResult.uri });

      // Save debug captures to local document directory and log them
      try {
        const debugDir = documentDirectory + 'debug_captures/';
        await makeDirectoryAsync(debugDir, { intermediates: true });
        
        const timestamp = Date.now();
        const origDest = `${debugDir}original_${timestamp}.jpg`;
        const croppedDest = `${debugDir}cropped_${timestamp}.jpg`;
        
        await copyAsync({ from: normalizedPhoto.uri, to: origDest });
        await copyAsync({ from: cropResult.uri, to: croppedDest });
        
        console.log(`[debug] Saved original capture to: ${origDest}`);
        console.log(`[debug] Saved cropped output to: ${croppedDest}`);

        // Try writing to workspace debug_captures if absolute path is accessible
        const workspaceDir = 'file:///c:/ReactNative/music-app/MeloNote/debug_captures/';
        try {
          await makeDirectoryAsync(workspaceDir, { intermediates: true });
          const wsOrigDest = `${workspaceDir}original_${timestamp}.jpg`;
          const wsCroppedDest = `${workspaceDir}cropped_${timestamp}.jpg`;
          await copyAsync({ from: normalizedPhoto.uri, to: wsOrigDest });
          await copyAsync({ from: cropResult.uri, to: wsCroppedDest });
          console.log(`[debug] Successfully saved copies to workspace: ${wsOrigDest} and ${wsCroppedDest}`);
        } catch (wsErr) {
          console.log('[debug] Could not write directly to workspace folder (expected on remote emulator/device):', wsErr);
        }
      } catch (err) {
        console.log('[debug] Error saving debug captures:', err);
      }

      setCroppedImageUri(cropResult.uri);
      setImageTitle(`camera_${Date.now()}.jpg`);
      setMusicxml(null);
      setShowSheet(false);
      setCropTop(0);
      setCropBottom(0);
      setCropLeft(0);
      setCropRight(0);
      setViewMode('confirm');
    } catch (err) {
      console.log('Camera capture error (uncaught exception):', err);
      console.warn('Camera capture error:', err);
      Alert.alert('Error', 'Failed to capture image.');
    } finally {
      setIsTakingPicture(false);
    }
  };

  const closeCamera = () => {
    console.log('Camera closed');
    setViewMode('dashboard');
  };

  const handleUploadImage = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false, // Disable native cropper to use the shared app Crop & Preview screen
        quality: 1,
        exif: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setCroppedImageUri(asset.uri);
        const filename = asset.fileName || `gallery_${Date.now()}.jpg`;
        setImageTitle(filename);
        setMusicxml(null);
        setShowSheet(false);
        setCropTop(0);
        setCropBottom(0);
        setCropLeft(0);
        setCropRight(0);
        setViewMode('confirm');
      }
    } catch (err) {
      console.warn('Gallery pick error:', err);
      Alert.alert('Error', 'Failed to open image gallery.');
    }
  };

  const handleRotateImage = async () => {
    if (!croppedImageUri) return;
    try {
      console.log('Rotating image...');
      const result = await ImageManipulator.manipulateAsync(
        croppedImageUri,
        [{ rotate: 90 }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      setCroppedImageUri(result.uri);
      setCropTop(0);
      setCropBottom(0);
      setCropLeft(0);
      setCropRight(0);
      console.log('Image rotated successfully:', result.uri);
    } catch (err) {
      console.error('Error rotating image:', err);
      Alert.alert('Error', 'Failed to rotate image.');
    }
  };

  const resetScanState = () => {
    setCroppedImageUri(null);
    setImageTitle('captured_score.jpg');
    setViewMode('dashboard');
    setStatusStep(0);
    setMusicxml(null);
    setShowSheet(false);
    setLoadingWarning('');
    setCropTop(0);
    setCropBottom(0);
    setCropLeft(0);
    setCropRight(0);
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (runningTaskId) {
      clearConversion(runningTaskId);
      setRunningTaskId(null);
    }
    clearLatestConversion('scan');
  };

  const startOMRScanning = async () => {
    if (!croppedImageUri) return;
    
    setViewMode('loading');
    setStatusStep(0);
    setLoadingWarning('');

    try {
      const activeId = await startSheetScan(
        croppedImageUri,
        imageTitle,
        cropTop,
        cropBottom,
        cropLeft,
        cropRight,
        BACKEND_URL
      );
      setRunningTaskId(activeId);
    } catch (err: any) {
      console.error('[scan] Scan initialization failed:', err);
      sendLocalNotification("Sheet scan failed.", "Please scan the sheet again.");
      setViewMode('confirm');
      setLoadingWarning('');
    }
  };

  // 1. Sheet Editor Mode
  if (showSheet && musicxml) {
    return (
      <CreateScreen
        initialMusicXML={musicxml}
        initialTitle={imageTitle.replace(/\.[^/.]+$/, "")}
        initialSourceType="scan"
        defaultEditMode={false}
        onExit={() => {
          setShowSheet(false);
          resetScanState();
        }}
      />
    );
  }

  if (!isStateLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: isDark ? '#050507' : '#FFFFFF', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FF8A00" />
      </View>
    );
  }

  // 2. Loading / Asynchronous Processing Mode
  if (viewMode === 'loading') {
    return (
      <GradientBackground>
        <View style={{ flex: 1 }}>
          {/* Header Bar */}
          <View style={{ height: 60, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)' }}>
            <Pressable
              onPress={() => setShowDiscardModal(true)}
              style={({ pressed }) => ({
                padding: 8,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons name="arrow-back" size={24} color={isDark ? 'white' : '#121212'} />
            </Pressable>
            <Text style={{ color: isDark ? 'white' : '#121212', fontSize: 16, fontWeight: '700' }}>Digitizing Sheet</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 40, paddingBottom: 40, gap: 16 }} showsVerticalScrollIndicator={false}>
            <View style={{ alignItems: 'center', marginBottom: 8 }}>
              <ActivityIndicator size="large" color="#FF4FA3" style={{ marginBottom: 24 }} />
              <Text style={[styles.loadingTitle, { color: isDark ? '#FFFFFF' : '#121212', textAlign: 'center' }]}>Transcribing Sheet Music</Text>
              <Text style={[styles.loadingSubtitle, { color: isDark ? '#8E929A' : '#60646C', textAlign: 'center', marginTop: 8, lineHeight: 20 }]}>
                Our OMR engine is analyzing notes and converting staff lines...
              </Text>
            </View>

            <GlassCard style={styles.stepsCard}>
              <ProcessStep
                label="Uploading Score Image"
                icon="cloud-upload-outline"
                status={statusStep === 0 ? 'active' : statusStep > 0 ? 'completed' : 'pending'}
              />
              <ProcessStep
                label="Applying CV Image Filters"
                icon="color-filter-outline"
                status={statusStep === 1 ? 'active' : statusStep > 1 ? 'completed' : 'pending'}
              />
              <ProcessStep
                label="Detecting Symbols & Staffs"
                icon="musical-notes-outline"
                status={statusStep === 2 ? 'active' : statusStep > 2 ? 'completed' : 'pending'}
              />
              <ProcessStep
                label="Reconstructing MusicXML"
                icon="code-working-outline"
                status={statusStep === 3 ? 'active' : statusStep > 3 ? 'completed' : 'pending'}
              />
              <ProcessStep
                label="Opening Workspace Editor"
                icon="sparkles-outline"
                status={statusStep === 4 ? 'active' : 'pending'}
              />
            </GlassCard>

            {loadingWarning ? (
              <View style={styles.warningContainer}>
                <Ionicons name="time-outline" size={20} color="#FF8A00" style={{ marginRight: 8 }} />
                <Text style={styles.warningText}>{loadingWarning}</Text>
              </View>
            ) : null}

            {/* Tips Rotator */}
            <EducationalTipsRotator />
          </ScrollView>

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
                  Discard OMR Scan?
                </Text>
                <Text style={{ color: isDark ? '#8e8e93' : '#60646C', fontSize: 14, lineHeight: 20, marginBottom: 24 }}>
                  Do you wish to cancel scanning? OMR analysis will be stopped.
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
                      setViewMode('dashboard');
                      setShowDiscardModal(false);
                      if (runningTaskId) {
                        cancelConversion(runningTaskId);
                        setRunningTaskId(null);
                      }
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
      </GradientBackground>
    );
  }

  // 2.5 Camera Capture View Mode
  if (viewMode === 'camera') {
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          ref={cameraRef}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setCameraLayout({ width, height });
          }}
        >
          {/* Guide overlay container centered on screen */}
          <View style={styles.cameraGuideContainer} pointerEvents="none">
            <View
              style={styles.cameraGuideBox}
              onLayout={(e) => {
                const { x, y, width, height } = e.nativeEvent.layout;
                console.log(`[camera] Guide overlay measured layout: x=${x}, y=${y}, w=${width}, h=${height}`);
                setGuideLayout({ x, y, width, height });
              }}
            >
              <View style={[styles.guideCorner, styles.guideCornerTL]} />
              <View style={[styles.guideCorner, styles.guideCornerTR]} />
              <View style={[styles.guideCorner, styles.guideCornerBL]} />
              <View style={[styles.guideCorner, styles.guideCornerBR]} />
            </View>
            <Text style={styles.cameraGuideText}>Center your sheet music inside the frame</Text>
          </View>

          {/* Header & Footer translucent control bars */}
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <View style={styles.cameraOverlay} pointerEvents="box-none">
              {/* Top translucent header */}
              <View style={styles.cameraHeader}>
                <Pressable
                  onPress={closeCamera}
                  style={styles.cameraCloseBtn}
                >
                  <Ionicons name="close" size={28} color="white" />
                </Pressable>
                <Text style={styles.cameraTitle}>Scan Sheet Music</Text>
                <View style={{ width: 44 }} />
              </View>

              {/* Bottom translucent control bar */}
              <View style={styles.cameraFooter}>
                <Pressable
                  onPress={takePicture}
                  disabled={isTakingPicture}
                  style={styles.shutterOuter}
                >
                  {isTakingPicture ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <View style={styles.shutterInner} />
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </CameraView>
      </View>
    );
  }

  // 3. Confirm / Preview Cropped Image Mode
  if (viewMode === 'confirm' && croppedImageUri) {
    return (
      <GradientBackground>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.textWrapper}>
            <Text style={[styles.title, { color: isDark ? '#FFFFFF' : '#121212' }]}>Crop & Preview</Text>
            <Text style={[styles.subtitle, { color: isDark ? '#8E929A' : '#60646C' }]}>Drag the corner handles to select region, rotate if needed</Text>
          </View>

          <GlassCard style={styles.previewCard}>
            <View
              style={styles.previewContainer}
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                if (width > 0 && height > 0) {
                  setImageLayout({ width, height });
                }
              }}
            >
              <Image
                source={{ uri: croppedImageUri }}
                style={styles.previewImage}
                resizeMode="contain"
                onLayout={(e) => {
                  const { width, height } = e.nativeEvent.layout;
                  if (width > 0 && height > 0) {
                    setImageLayout({ width, height });
                  }
                }}
              />

              {/* Crop box overlay */}
              {imageLayout.width > 0 && (
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      width: imageLayout.width,
                      height: imageLayout.height,
                      alignSelf: 'center',
                    },
                  ]}
                >
                  {/* Grayed out background overlays */}
                  <View style={[styles.cropOverlay, { top: 0, left: 0, right: 0, height: `${cropTop}%` }]} />
                  <View style={[styles.cropOverlay, { bottom: 0, left: 0, right: 0, height: `${cropBottom}%` }]} />
                  <View style={[styles.cropOverlay, { top: `${cropTop}%`, bottom: `${cropBottom}%`, left: 0, width: `${cropLeft}%` }]} />
                  <View style={[styles.cropOverlay, { top: `${cropTop}%`, bottom: `${cropBottom}%`, right: 0, width: `${cropRight}%` }]} />

                  {/* Highlighted Crop Area Box */}
                  <View
                    style={{
                      position: 'absolute',
                      top: `${cropTop}%`,
                      bottom: `${cropBottom}%`,
                      left: `${cropLeft}%`,
                      right: `${cropRight}%`,
                      borderWidth: 2,
                      borderColor: '#FF4FA3',
                    }}
                  >
                    {/* Corner Handles */}
                    <View
                      {...panTL.panHandlers}
                      style={[styles.cropHandle, { top: -12, left: -12 }]}
                    />
                    <View
                      {...panTR.panHandlers}
                      style={[styles.cropHandle, { top: -12, right: -12 }]}
                    />
                    <View
                      {...panBL.panHandlers}
                      style={[styles.cropHandle, { bottom: -12, left: -12 }]}
                    />
                    <View
                      {...panBR.panHandlers}
                      style={[styles.cropHandle, { bottom: -12, right: -12 }]}
                    />
                  </View>
                </View>
              )}
            </View>
          </GlassCard>

          {/* Quick rotation & crop adjustment bar */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginVertical: 4 }}>
            <SecondaryButton
              title="Rotate 90°"
              icon="refresh-outline"
              onPress={handleRotateImage}
              style={{ flex: 0.6 }}
            />
            <SecondaryButton
              title="Reset Crop"
              icon="contract-outline"
              onPress={() => {
                setCropTop(0);
                setCropBottom(0);
                setCropLeft(0);
                setCropRight(0);
              }}
              style={{ flex: 0.6 }}
            />
          </View>

          <View style={styles.buttonRow}>
            <SecondaryButton
              title="Retake Image"
              icon="arrow-back-outline"
              onPress={resetScanState}
              style={styles.actionBtn}
            />
            <PrimaryButton
              title="Transcribe"
              icon="arrow-forward-outline"
              onPress={startOMRScanning}
              style={styles.actionBtn}
            />
          </View>
        </ScrollView>
      </GradientBackground>
    );
  }

  // 4. Default Scanning Mode (Dashboard)
  return (
    <GradientBackground>
      <ScrollView
        ref={(r) => WalkthroughRegistry.register('active-scrollview', r)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.illustrationWrapper}>
          <ScanIllustration />
        </View>

        <View style={styles.textWrapper}>
          <Text style={[styles.title, { color: isDark ? '#FFFFFF' : '#121212' }]}>Scan Sheet Music</Text>
          <Text style={[styles.subtitle, { color: isDark ? '#8E929A' : '#60646C' }]}>
            Convert printed or handwritten sheet music into editable digital notation instantly.
          </Text>
        </View>

        <GlassCard style={styles.uploadCard}>
          <Pressable style={styles.uploadDottedBorder} onPress={handleUploadImage}>
            <Ionicons name="cloud-upload-outline" size={40} color="#FF4FA3" />
            <Text style={[styles.uploadText, { color: isDark ? '#FFFFFF' : '#121212' }]}>Select sheet music file</Text>
            <Text style={[styles.uploadSubtext, { color: isDark ? '#8E929A' : '#60646C' }]}>Supports PDF, JPEG, and PNG images</Text>
          </Pressable>
        </GlassCard>

        <View style={styles.buttonRow}>
          <PrimaryButton
            ref={(r) => WalkthroughRegistry.register('scan-camera', r)}
            title="Scan with Camera"
            icon="camera-outline"
            onPress={handleScanWithCamera}
            style={styles.actionBtn}
          />
          <SecondaryButton
            ref={(r) => WalkthroughRegistry.register('scan-upload', r)}
            title="Upload Image"
            icon="image-outline"
            onPress={handleUploadImage}
            style={styles.actionBtn}
          />
        </View>
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
    gap: 20,
  },
  illustrationWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  textWrapper: {
    alignItems: 'center',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#8E929A',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  uploadCard: {
    padding: 10,
    height: 160,
  },
  uploadDottedBorder: {
    flex: 1,
    borderWidth: 2,
    borderColor: 'rgba(255, 79, 163, 0.15)',
    borderStyle: 'dashed',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  uploadSubtext: {
    color: '#8E929A',
    fontSize: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  actionBtn: {
    flex: 1,
  },
  previewCard: {
    padding: 12,
    height: 380,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  loadingSubtitle: {
    color: '#8E929A',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  stepsCard: {
    width: '100%',
    maxWidth: 380,
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 16,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepIconWrapper: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepText: {
    fontSize: 14,
    fontWeight: '600',
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    backgroundColor: 'rgba(255, 138, 0, 0.15)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 138, 0, 0.25)',
  },
  warningText: {
    color: '#FF8A00',
    fontSize: 13,
    fontWeight: '600',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
    justifyContent: 'space-between',
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  cameraCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  cameraGuideContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  cameraGuideBox: {
    width: '100%',
    aspectRatio: 0.75,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    position: 'relative',
  },
  guideCorner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#FF4FA3',
  },
  guideCornerTL: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  guideCornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  guideCornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  guideCornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  cameraGuideText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cameraFooter: {
    paddingVertical: 32,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
  },
  previewContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cropOverlay: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  cropHandle: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF4FA3',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    elevation: 5,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
  },
});
