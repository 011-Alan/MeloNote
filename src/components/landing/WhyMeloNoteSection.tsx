import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';

export function WhyMeloNoteSection() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 800;

  const traditionalSteps = [
    { label: 'Record', desc: 'Capture acoustic file' },
    { label: 'Rewrite Manually', desc: 'Hours of writing notes' },
    { label: 'Correct Errors', desc: 'Proofread and erase' },
    { label: 'Practice', desc: 'Slow, isolated review' },
  ];

  const melonoteSteps = [
    { label: 'Upload', desc: 'Drag-and-drop file' },
    { label: 'AI Transcribes', desc: 'Instant accuracy check' },
    { label: 'Edit', desc: 'Fine-tune in editor' },
    { label: 'Playback', desc: 'Scrub and sync listen' },
    { label: 'Save', desc: 'Export in any format' },
    { label: 'Practice', desc: 'Adaptive evaluation' },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Why MeloNote?</Text>
      <Text style={styles.sectionSubtitle}>
        Traditional sheet music writing takes hours of grueling attention. MeloNote handles transcription in seconds so you can focus on playing.
      </Text>

      <View style={[styles.workflowLayout, isDesktop ? styles.row : styles.column]}>
        {/* Traditional Workflow Card */}
        <Animated.View
          entering={FadeInUp.delay(100).duration(600)}
          style={[styles.workflowCard, isDesktop ? styles.width50 : styles.width100]}
        >
          <Text style={styles.cardHeaderTitle}>Traditional Workflow</Text>
          <Text style={styles.cardHeaderSub}>Slow, manual, and error-prone</Text>

          <View style={styles.timeline}>
            {traditionalSteps.map((step, idx) => (
              <View key={idx} style={styles.timelineItem}>
                <View style={styles.timelineBadgeGrey}>
                  <Text style={styles.badgeText}>{idx + 1}</Text>
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.stepTitleGrey}>{step.label}</Text>
                  <Text style={styles.stepDesc}>{step.desc}</Text>
                </View>
                {idx < traditionalSteps.length - 1 && <View style={styles.timelineConnectorGrey} />}
              </View>
            ))}
          </View>
        </Animated.View>

        {/* MeloNote Workflow Card */}
        <Animated.View
          entering={FadeInUp.delay(300).duration(600)}
          style={[styles.workflowCard, styles.workflowCardActive, isDesktop ? styles.width50 : styles.width100]}
        >
          <LinearGradient
            colors={['rgba(255, 138, 0, 0.08)', 'rgba(123, 97, 255, 0.08)']}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.cardHeaderTitleActive}>MeloNote Workflow</Text>
          <Text style={styles.cardHeaderSubActive}>AI-augmented, fast, and continuous</Text>

          <View style={styles.timeline}>
            {melonoteSteps.map((step, idx) => (
              <View key={idx} style={styles.timelineItem}>
                <LinearGradient
                  colors={['#FF8A00', '#FF4FA3', '#7B61FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.timelineBadgeActive}
                >
                  <Text style={styles.badgeTextActive}>{idx + 1}</Text>
                </LinearGradient>
                <View style={styles.timelineContent}>
                  <Text style={styles.stepTitleActive}>{step.label}</Text>
                  <Text style={styles.stepDescActive}>{step.desc}</Text>
                </View>
                {idx < melonoteSteps.length - 1 && (
                  <LinearGradient
                    colors={['#FF4FA3', '#7B61FF']}
                    style={styles.timelineConnectorActive}
                  />
                )}
              </View>
            ))}
          </View>
        </Animated.View>
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
  workflowLayout: {
    width: '100%',
    maxWidth: 1100,
    gap: 32,
  },
  row: {
    flexDirection: 'row',
  },
  column: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  width50: {
    width: '48%',
  },
  width100: {
    width: '100%',
    maxWidth: 500,
  },
  workflowCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    padding: 36,
    position: 'relative',
    overflow: 'hidden',
  },
  workflowCardActive: {
    borderColor: 'rgba(255, 79, 163, 0.15)',
    shadowColor: '#FF4FA3',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
  cardHeaderTitle: {
    color: '#B0B4BA',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
    fontFamily: 'var(--font-display)',
  },
  cardHeaderTitleActive: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
    fontFamily: 'var(--font-display)',
  },
  cardHeaderSub: {
    color: '#60646C',
    fontSize: 14,
    marginBottom: 36,
  },
  cardHeaderSubActive: {
    color: '#FF4FA3',
    fontSize: 14,
    marginBottom: 36,
    fontWeight: '600',
  },
  timeline: {
    gap: 24,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  timelineBadgeGrey: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 20,
    zIndex: 2,
  },
  timelineBadgeActive: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 20,
    zIndex: 2,
  },
  badgeText: {
    color: '#60646C',
    fontWeight: 'bold',
    fontSize: 14,
  },
  badgeTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  timelineContent: {
    flex: 1,
  },
  stepTitleGrey: {
    color: '#60646C',
    fontSize: 16,
    fontWeight: '700',
  },
  stepTitleActive: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  stepDesc: {
    color: '#40444C',
    fontSize: 13,
    marginTop: 2,
  },
  stepDescActive: {
    color: '#B0B4BA',
    fontSize: 13,
    marginTop: 2,
  },
  timelineConnectorGrey: {
    position: 'absolute',
    left: 15,
    top: 32,
    width: 2,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    zIndex: 1,
  },
  timelineConnectorActive: {
    position: 'absolute',
    left: 15,
    top: 32,
    width: 2,
    height: 28,
    zIndex: 1,
  },
});
