import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';

interface FeatureItem {
  icon: string;
  colors: [string, string];
  title: string;
  desc: string;
}

const features: FeatureItem[] = [
  {
    icon: '🎵',
    colors: ['#FF8A00', '#FF4FA3'],
    title: 'AI Music Transcription',
    desc: 'Extract polyphonic or monophonic notes, rests, key signatures, and time signatures directly from any audio file.',
  },
  {
    icon: '📄',
    colors: ['#FF4FA3', '#7B61FF'],
    title: 'Optical Music Recognition',
    desc: 'Take a photo or scan printed sheet music to instantly import it as digital, editable notation.',
  },
  {
    icon: '✏️',
    colors: ['#7B61FF', '#FF8A00'],
    title: 'Interactive Sheet Editor',
    desc: 'Modify your transcriptions inside our robust editor. Add, delete, adjust pitches, and edit lyrics easily.',
  },
  {
    icon: '▶️',
    colors: ['#FF8A00', '#7B61FF'],
    title: 'Sheet Music Playback',
    desc: 'Listen to your scores played back with customizable instrument voices and real-time audio scrubbing.',
  },
  {
    icon: '🎼',
    colors: ['#FF4FA3', '#FF8A00'],
    title: 'Original Audio Synchronization',
    desc: 'Overlay original recordings on your sheet music, allowing you to easily verify transcription accuracy.',
  },
  {
    icon: '💾',
    colors: ['#7B61FF', '#FF4FA3'],
    title: 'Project Workspace',
    desc: 'Organize files into dynamic workspaces. Export and share scores via MIDI, MusicXML, PDF, or custom shareable links.',
  },
  {
    icon: '☁️',
    colors: ['#FF8A00', '#FF4FA3'],
    title: 'Save & Continue Later',
    desc: 'Your edits sync automatically to the cloud. Pick up where you left off on any mobile device or browser.',
  },
  {
    icon: '⚡',
    colors: ['#7B61FF', '#FF8A00'],
    title: 'Fast AI Processing',
    desc: 'Get highly accurate digital sheet music in less than 30 seconds, saving you hours of tedious manual rewriting.',
  },
];

export function FeaturesSection() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1000;
  const isTablet = width >= 650 && width < 1000;

  const getCardWidthStyle = () => {
    if (isDesktop) return styles.width25;
    if (isTablet) return styles.width50;
    return styles.width100;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Everything You Need to Create & Practice</Text>
      <Text style={styles.sectionSubtitle}>
        MeloNote is packed with premium tools to support composers, students, and educators.
      </Text>

      <View style={styles.grid}>
        {features.map((feature, idx) => (
          <Animated.View
            key={idx}
            entering={FadeInUp.delay(idx * 80).duration(500)}
            style={[styles.card, getCardWidthStyle()]}
          >
            <View style={styles.cardHeader}>
              <LinearGradient
                colors={feature.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconCircle}
              >
                <Text style={styles.iconText}>{feature.icon}</Text>
              </LinearGradient>
            </View>
            <Text style={styles.cardTitle}>{feature.title}</Text>
            <Text style={styles.cardDesc}>{feature.desc}</Text>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 90,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
    maxWidth: 800,
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
  grid: {
    width: '100%',
    maxWidth: 1200,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 20,
  },
  width25: {
    width: '23.5%', // 4 columns
  },
  width50: {
    width: '47%', // 2 columns
  },
  width100: {
    width: '100%', // 1 column
    maxWidth: 400,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 24,
    alignItems: 'flex-start',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(10px)',
        transition: 'transform 0.3s ease, border-color 0.3s ease, background-color 0.3s ease',
        cursor: 'pointer',
        ':hover': {
          transform: 'translateY(-6px)',
          borderColor: 'rgba(255, 255, 255, 0.12)',
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
        },
      },
    }),
  },
  cardHeader: {
    marginBottom: 20,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  iconText: {
    fontSize: 22,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    fontFamily: 'var(--font-display)',
  },
  cardDesc: {
    color: '#B0B4BA',
    fontSize: 14,
    lineHeight: 20,
  },
});
