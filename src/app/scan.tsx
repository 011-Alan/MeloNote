import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, ScrollView, Image, ActivityIndicator, Alert, Platform, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect, Path, Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';

// Import design system & sheet editor
import { GradientBackground, GlassCard, PrimaryButton, SecondaryButton } from '@/components/ui/DesignSystem';
import CreateScreen from './create';

const BACKEND_URL = 'http://192.168.1.4:5000';

const ScanIllustration = () => (
  <Svg viewBox="0 0 200 160" width={200} height={160}>
    <Defs>
      <LinearGradient id="sheetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
        <Stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
      </LinearGradient>
      <LinearGradient id="laserGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <Stop offset="0%" stopColor="#FF8A00" stopOpacity="0.8" />
        <Stop offset="50%" stopColor="#FF4FA3" stopOpacity="0.8" />
        <Stop offset="100%" stopColor="#7B61FF" stopOpacity="0.8" />
      </LinearGradient>
    </Defs>
    
    <Circle cx="100" cy="80" r="60" fill="rgba(123,97,255,0.08)" />
    <Rect x="50" y="20" width="100" height="120" rx="8" fill="url(#sheetGrad)" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
    
    <Line x1="60" y1="45" x2="140" y2="45" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
    <Line x1="60" y1="55" x2="140" y2="55" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
    <Line x1="60" y1="65" x2="140" y2="65" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
    
    <Line x1="60" y1="85" x2="140" y2="85" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
    <Line x1="60" y1="95" x2="140" y2="95" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
    <Line x1="60" y1="105" x2="140" y2="105" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />

    <Path d="M70,35 C70,45 80,45 80,35" fill="none" stroke="#FF4FA3" strokeWidth="2" />
    <Path d="M75,30 L75,70" fill="none" stroke="#FF4FA3" strokeWidth="2" />

    <Circle cx="95" cy="55" r="4" fill="#7B61FF" />
    <Line x1="99" y1="55" x2="99" y2="40" stroke="#7B61FF" strokeWidth="1.5" />
    
    <Circle cx="120" cy="65" r="4" fill="#FF8A00" />
    <Line x1="124" y1="65" x2="124" y2="50" stroke="#FF8A00" strokeWidth="1.5" />

    <Rect x="40" y="72" width="120" height="4" rx="2" fill="url(#laserGrad)" />
    <Path d="M 50,74 L 50,110 M 70,74 L 70,110 M 90,74 L 90,110 M 110,74 L 110,110 M 130,74 L 130,110 M 150,74 L 150,110" stroke="rgba(123, 97, 255, 0.2)" strokeWidth="1" strokeDasharray="3,3" />
  </Svg>
);

interface ProcessStepProps {
  label: string;
  icon: string;
  status: 'pending' | 'active' | 'completed';
}

const ProcessStep: React.FC<ProcessStepProps> = ({ label, icon, status }) => {
  const getColors = () => {
    switch (status) {
      case 'completed':
        return { text: '#FFFFFF', iconColor: '#34C759', opacity: 1 };
      case 'active':
        return { text: '#FF4FA3', iconColor: '#FF4FA3', opacity: 1 };
      default:
        return { text: '#8E929A', iconColor: '#8E929A', opacity: 0.5 };
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
          <Ionicons name="ellipse-outline" size={20} color="#8E929A" />
        )}
      </View>
      <View style={styles.stepInfo}>
        <Ionicons name={icon as any} size={18} color={colors.iconColor} style={{ marginRight: 8 }} />
        <Text style={[styles.stepText, { color: colors.text }]}>{label}</Text>
      </View>
    </View>
  );
};

export default function ScanSheetScreen() {
  const [imageTitle, setImageTitle] = useState<string>('captured_score.jpg');
  const [croppedImageUri, setCroppedImageUri] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'dashboard' | 'confirm' | 'loading'>('dashboard');

  const [statusStep, setStatusStep] = useState<number>(0);
  const [showSheet, setShowSheet] = useState<boolean>(false);
  const [musicxml, setMusicxml] = useState<string | null>(null);
  const [loadingWarning, setLoadingWarning] = useState<string>('');

  const pollingIntervalRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
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

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, // Restore native crop screen (as before)
        quality: 1,
        exif: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setCroppedImageUri(asset.uri);
        const filename = asset.fileName || `camera_${Date.now()}.jpg`;
        setImageTitle(filename);
        setViewMode('confirm');
      }
    } catch (err) {
      console.warn('Camera launch error:', err);
      Alert.alert('Error', 'Failed to launch camera.');
    }
  };

  const handleUploadImage = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, // Restore native crop screen (as before)
        quality: 1,
        exif: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setCroppedImageUri(asset.uri);
        const filename = asset.fileName || `gallery_${Date.now()}.jpg`;
        setImageTitle(filename);
        setViewMode('confirm');
      }
    } catch (err) {
      console.warn('Gallery pick error:', err);
      Alert.alert('Error', 'Failed to open image gallery.');
    }
  };

  const resetScanState = () => {
    setCroppedImageUri(null);
    setImageTitle('captured_score.jpg');
    setViewMode('dashboard');
    setStatusStep(0);
    setMusicxml(null);
    setLoadingWarning('');
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  const startOMRScanning = async () => {
    if (!croppedImageUri) return;
    
    setViewMode('loading');
    setStatusStep(0); // Uploading
    setLoadingWarning('');

    try {
      console.log(`[scan] Uploading cropped file natively to: ${BACKEND_URL}/scan/start`);
      const response = await uploadAsync(`${BACKEND_URL}/scan/start`, croppedImageUri, {
        fieldName: 'image',
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        headers: {
          'Accept': 'application/json',
        },
        parameters: {
          'name': imageTitle,
        },
      });

      if (response.status !== 200) {
        throw new Error(`Server returned status ${response.status}: ${response.body}`);
      }

      const json = JSON.parse(response.body);
      if (!json.success || !json.task_id) {
        throw new Error(json.error || json.message || 'Failed to start OMR scanning task.');
      }

      const taskId = json.task_id;
      console.log(`[scan] Async scanning task started. Task ID: ${taskId}`);

      // Start Polling Status
      let elapsedSeconds = 0;
      pollingIntervalRef.current = setInterval(async () => {
        elapsedSeconds += 2;
        
        // Show warnings if processing takes longer
        if (elapsedSeconds >= 24) {
          setLoadingWarning("Scanning is taking longer than expected. Please wait...");
        }

        try {
          const statusRes = await fetch(`${BACKEND_URL}/scan/status/${taskId}`);
          const statusJson = await statusRes.json();

          if (statusJson.success) {
            console.log(`[scan] Polling status: ${statusJson.status}, stage: ${statusJson.stage}`);
            
            if (statusJson.status === 'completed') {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
              
              // Frontend verification for notes count
              const xml = statusJson.musicxml;
              const hasNotes = xml.includes('<note');
              if (!hasNotes) {
                setViewMode('confirm');
                setLoadingWarning('');
                Alert.alert(
                  'No Notes Detected',
                  'No musical notes were detected. Please use a clearer, higher-resolution image or retake the photo.'
                );
                return;
              }

              setMusicxml(xml);
              setStatusStep(4); // Opening editor
              
              const openEditor = () => {
                setViewMode('dashboard');
                setShowSheet(true);
                setLoadingWarning('');
              };

              if (statusJson.warning) {
                setTimeout(() => {
                  Alert.alert(
                    'Low Resolution Warning',
                    statusJson.warning,
                    [{ text: 'Open Editor', onPress: openEditor }]
                  );
                }, 1200);
              } else {
                setTimeout(openEditor, 1200);
              }

            } else if (statusJson.status === 'failed') {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
              setViewMode('confirm');
              setLoadingWarning('');
              Alert.alert('Scan Failed', statusJson.error || 'OMR processing failed.');
            } else {
              // Map background OMR stages to progress steps
              const stage = statusJson.stage;
              if (stage === 'preparing') setStatusStep(0);
              else if (stage === 'detecting_staffs') setStatusStep(1);
              else if (stage === 'recognizing_symbols') setStatusStep(2);
              else if (stage === 'generating_xml') setStatusStep(3);
            }
          }
        } catch (pollErr) {
          console.log('[scan] Status check temporary error:', pollErr);
        }
      }, 2000);

    } catch (err: any) {
      console.error('[scan] Scan initialization failed:', err);
      setViewMode('confirm');
      setLoadingWarning('');
      Alert.alert(
        'Upload Failed',
        err.message || 'Connection to OMR server failed. Please ensure the backend server is running and try again.'
      );
    }
  };

  // 1. Sheet Editor Mode
  if (showSheet && musicxml) {
    return (
      <CreateScreen
        initialMusicXML={musicxml}
        initialTitle={imageTitle.replace(/\.[^/.]+$/, "")}
        initialSourceType="transcribed"
        defaultEditMode={false}
        onExit={() => {
          setShowSheet(false);
          resetScanState();
        }}
      />
    );
  }

  // 2. Loading / Asynchronous Processing Mode
  if (viewMode === 'loading') {
    return (
      <GradientBackground>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF4FA3" style={{ marginBottom: 24 }} />
          <Text style={styles.loadingTitle}>Transcribing Sheet Music</Text>
          <Text style={styles.loadingSubtitle}>
            Our OMR engine is analyzing notes and converting staff lines...
          </Text>

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
        </View>
      </GradientBackground>
    );
  }

  // 3. Confirm / Preview Cropped Image Mode
  if (viewMode === 'confirm' && croppedImageUri) {
    return (
      <GradientBackground>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.textWrapper}>
            <Text style={styles.title}>Confirm Sheet Image</Text>
            <Text style={styles.subtitle}>Ensure notes and staves are clearly visible inside selection</Text>
          </View>

          <GlassCard style={styles.previewCard}>
            <Image source={{ uri: croppedImageUri }} style={styles.previewImage} resizeMode="contain" />
          </GlassCard>

          <View style={styles.buttonRow}>
            <SecondaryButton
              title="Retake Image"
              icon="refresh-outline"
              onPress={resetScanState}
              style={styles.actionBtn}
            />
            <PrimaryButton
              title="Transcribe Score"
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
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.illustrationWrapper}>
          <ScanIllustration />
        </View>

        <View style={styles.textWrapper}>
          <Text style={styles.title}>Scan Sheet Music</Text>
          <Text style={styles.subtitle}>
            Convert printed or handwritten sheet music into editable digital notation instantly.
          </Text>
        </View>

        <GlassCard style={styles.uploadCard}>
          <Pressable style={styles.uploadDottedBorder} onPress={handleUploadImage}>
            <Ionicons name="cloud-upload-outline" size={40} color="#FF4FA3" />
            <Text style={styles.uploadText}>Select sheet music file</Text>
            <Text style={styles.uploadSubtext}>Supports PDF, JPEG, and PNG images</Text>
          </Pressable>
        </GlassCard>

        <View style={styles.buttonRow}>
          <PrimaryButton
            title="Scan with Camera"
            icon="camera-outline"
            onPress={handleScanWithCamera}
            style={styles.actionBtn}
          />
          <SecondaryButton
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
});
