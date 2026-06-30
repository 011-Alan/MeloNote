import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming, withSequence } from 'react-native-reanimated';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';

interface DemoStep {
  id: number;
  label: string;
  emoji: string;
  title: string;
  desc: string;
}

const steps: DemoStep[] = [
  {
    id: 1,
    label: 'Audio Recording',
    emoji: '🎙️',
    title: 'High-Fidelity Audio Input',
    desc: 'Record directly in the app or upload any MP3/WAV file. MeloNote captures clean signals and filters background noise to ensure maximum accuracy.',
  },
  {
    id: 2,
    label: 'AI Analysis',
    emoji: '🤖',
    title: 'Advanced AI Transcription',
    desc: 'Our proprietary deep neural network processes the audio, running pitch-tracking algorithms, tempo estimation, and rhythmic quantization to isolate notes.',
  },
  {
    id: 3,
    label: 'Digital Sheet Music',
    emoji: '🎼',
    title: 'Instant Notation Generation',
    desc: 'MeloNote automatically renders the recognized pitches and durations onto a standard sheet music staff, complete with treble/bass clefs and bar lines.',
  },
  {
    id: 4,
    label: 'Playback + Editing',
    emoji: '✏️',
    title: 'Interactive Editing & Playback',
    desc: 'Play back your transcription with high-quality MIDI synths. Make changes on the fly using our built-in click-and-drag sheet music editor.',
  },
  {
    id: 5,
    label: 'Save Project',
    emoji: '💾',
    title: 'Cloud Project Workspace',
    desc: 'Export to PDF, MusicXML, or MIDI. Save your project securely to the cloud to continue editing or practicing on any device.',
  },
];

export function InteractiveDemoSection() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 800;

  const [activeStep, setActiveStep] = useState(1);

  // Auto transition steps every 6 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev === 5 ? 1 : prev + 1));
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const renderStepPreview = () => {
    switch (activeStep) {
      case 1:
        return (
          <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut.duration(200)} style={styles.previewContainer}>
            <View style={styles.recordingWrapper}>
              <View style={styles.micCircle}>
                <Text style={{ fontSize: 32 }}>🎙️</Text>
              </View>
              <Text style={styles.previewSubtext}>Recording Audio (44.1 kHz)...</Text>
              <View style={styles.waveformContainer}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((val, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.waveBar,
                      {
                        height: val * 4 + 4,
                        backgroundColor: idx % 2 === 0 ? '#FF8A00' : '#FF4FA3',
                      },
                    ]}
                  />
                ))}
              </View>
            </View>
          </Animated.View>
        );
      case 2:
        return (
          <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut.duration(200)} style={styles.previewContainer}>
            <View style={styles.analysisWrapper}>
              <Text style={styles.previewTitleText}>AI Transcription Engine</Text>
              <View style={styles.matrixContainer}>
                {/* Simulated spectral analyzer */}
                <Svg height="120" width="100%">
                  <Path
                    d="M 10 90 Q 50 10 100 80 T 200 40 T 300 70 T 400 90"
                    fill="none"
                    stroke="#7B61FF"
                    strokeWidth={3}
                  />
                  <Path
                    d="M 10 90 Q 50 50 100 30 T 200 80 T 300 20 T 400 90"
                    fill="none"
                    stroke="#FF4FA3"
                    strokeWidth={2}
                    strokeDasharray="5,5"
                  />
                  <Line x1={150} y1={0} x2={150} y2={120} stroke="#FF8A00" strokeWidth={1.5} />
                </Svg>
              </View>
              <Text style={styles.previewSubtext}>Pitch Detected: C4 (261.6 Hz) | Confidence: 99.4%</Text>
            </View>
          </Animated.View>
        );
      case 3:
        return (
          <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut.duration(200)} style={styles.previewContainer}>
            <View style={styles.sheetWrapper}>
              <Svg height="130" width="100%" viewBox="0 0 400 130">
                {/* Staff Lines */}
                {[0, 1, 2, 3, 4].map((i) => (
                  <Line key={i} x1={20} y1={30 + i * 14} x2={380} y2={30 + i * 14} stroke="rgba(255, 255, 255, 0.25)" strokeWidth={1.5} />
                ))}
                {/* Clef Mock */}
                <Text style={{ x: 30, y: 80, fontSize: 44, fill: '#FFFFFF' } as any}>𝄞</Text>
                {/* Notes */}
                <Circle cx={120} cy={72} r={6} fill="#FF8A00" />
                <Line x1={126} y1={72} x2={126} y2={40} stroke="#FF8A00" strokeWidth={2} />

                <Circle cx={180} cy={65} r={6} fill="#FF4FA3" />
                <Line x1={186} y1={65} x2={186} y2={33} stroke="#FF4FA3" strokeWidth={2} />

                <Circle cx={240} cy={58} r={6} fill="#7B61FF" />
                <Line x1={246} y1={58} x2={246} y2={26} stroke="#7B61FF" strokeWidth={2} />
              </Svg>
            </View>
          </Animated.View>
        );
      case 4:
        return (
          <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut.duration(200)} style={styles.previewContainer}>
            <View style={styles.playbackWrapper}>
              <View style={styles.playbackControls}>
                <Text style={{ fontSize: 24 }}>▶️</Text>
                <Text style={{ fontSize: 24, marginHorizontal: 12 }}>⏸️</Text>
                <Text style={styles.previewSubtext}>BPM: 120 | Key: C Major</Text>
              </View>
              {/* Highlight bar */}
              <View style={styles.noteEditorGrid}>
                <View style={styles.noteBlockActive} />
                <View style={styles.noteBlock} />
                <View style={styles.noteBlock} />
                <View style={styles.noteBlock} />
              </View>
            </View>
          </Animated.View>
        );
      case 5:
        return (
          <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut.duration(200)} style={styles.previewContainer}>
            <View style={styles.saveWrapper}>
              <Text style={styles.saveIcon}>💾</Text>
              <Text style={styles.saveTitle}>Project Saved!</Text>
              <View style={styles.exportBadges}>
                <Text style={styles.badge}>PDF</Text>
                <Text style={styles.badge}>MusicXML</Text>
                <Text style={styles.badge}>MIDI</Text>
              </View>
            </View>
          </Animated.View>
        );
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Interactive AI Workflow</Text>
      <Text style={styles.sectionSubtitle}>
        See how MeloNote effortlessly transforms raw acoustics into structured music sheets.
      </Text>

      <View style={[styles.mainLayout, isDesktop ? styles.row : styles.column]}>
        {/* Left Side: Step switchers */}
        <View style={[styles.stepList, isDesktop ? styles.width40 : styles.width100]}>
          {steps.map((step) => {
            const isActive = step.id === activeStep;
            return (
              <Pressable
                key={step.id}
                onPress={() => setActiveStep(step.id)}
                style={[styles.stepItem, isActive && styles.stepItemActive]}
              >
                <View style={[styles.stepNumber, isActive && styles.stepNumberActive]}>
                  <Text style={[styles.stepNumberText, isActive && styles.stepNumberTextActive]}>
                    {step.emoji}
                  </Text>
                </View>
                <View style={styles.stepTextContainer}>
                  <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>
                    {step.label}
                  </Text>
                  {isActive && (
                    <Text style={styles.stepDescText}>{step.desc}</Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Right Side: Interactive graphic visualization */}
        <View style={[styles.graphicPanel, isDesktop ? styles.width60 : styles.width100]}>
          <LinearGradient
            colors={['rgba(255,255,255,0.03)', 'rgba(255,255,255,0.01)']}
            style={styles.graphicGlass}
          >
            {renderStepPreview()}
          </LinearGradient>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 80,
    paddingHorizontal: 24,
    alignItems: 'center',
    backgroundColor: '#0A0A0C',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
    fontFamily: 'var(--font-display)',
  },
  sectionSubtitle: {
    color: '#B0B4BA',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 600,
    marginBottom: 60,
  },
  mainLayout: {
    width: '100%',
    maxWidth: 1100,
    alignItems: 'center',
    gap: 40,
  },
  row: {
    flexDirection: 'row',
  },
  column: {
    flexDirection: 'column',
  },
  width40: {
    width: '42%',
  },
  width60: {
    width: '58%',
  },
  width100: {
    width: '100%',
  },
  stepList: {
    gap: 16,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    ...Platform.select({
      web: {
        transition: 'all 0.3s ease',
        cursor: 'pointer',
      },
    }),
  },
  stepItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  stepNumber: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  stepNumberActive: {
    backgroundColor: 'rgba(255, 79, 163, 0.15)',
  },
  stepNumberText: {
    fontSize: 20,
  },
  stepNumberTextActive: {
    color: '#FF4FA3',
  },
  stepTextContainer: {
    flex: 1,
  },
  stepLabel: {
    color: '#B0B4BA',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  stepLabelActive: {
    color: '#FFFFFF',
  },
  stepDescText: {
    color: '#B0B4BA',
    fontSize: 14,
    lineHeight: 20,
  },
  graphicPanel: {
    width: '100%',
    alignItems: 'stretch',
  },
  graphicGlass: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    height: 380,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
  },
  previewContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  recordingWrapper: {
    alignItems: 'center',
  },
  micCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 138, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FF8A00',
    marginBottom: 20,
    ...Platform.select({
      web: {
        animation: 'pulse 2s infinite',
      },
    }),
  },
  waveformContainer: {
    flexDirection: 'row',
    height: 60,
    alignItems: 'center',
    gap: 4,
    marginTop: 20,
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
  },
  previewSubtext: {
    color: '#B0B4BA',
    fontSize: 14,
  },
  analysisWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  previewTitleText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  matrixContainer: {
    width: '100%',
    height: 120,
    marginBottom: 20,
    justifyContent: 'center',
  },
  sheetWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playbackWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  playbackControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  noteEditorGrid: {
    flexDirection: 'row',
    gap: 12,
    width: '80%',
    height: 50,
  },
  noteBlock: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
  },
  noteBlockActive: {
    flex: 1,
    backgroundColor: '#7B61FF',
    borderRadius: 8,
    shadowColor: '#7B61FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  saveWrapper: {
    alignItems: 'center',
  },
  saveIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  saveTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  exportBadges: {
    flexDirection: 'row',
    gap: 12,
  },
  badge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#FFFFFF',
    borderRadius: 12,
    fontWeight: 'bold',
    fontSize: 12,
  },
});
