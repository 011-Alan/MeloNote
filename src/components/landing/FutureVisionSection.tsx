import React, { useEffect } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  FadeInUp,
} from 'react-native-reanimated';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

interface VisionItem {
  icon: string;
  title: string;
  desc: string;
  color: string;
}

const items: VisionItem[] = [
  {
    icon: '🎯',
    title: 'AI Practice Evaluation',
    desc: 'Get instant, note-by-note feedback on your performance accuracy when practicing with your instrument.',
    color: '#FF8A00',
  },
  {
    icon: '🧠',
    title: 'Music Theory Quizzes',
    desc: 'Strengthen your reading and notation skills through adaptive exercises customized to your skill level.',
    color: '#FF4FA3',
  },
  {
    icon: '⚡',
    title: 'Rhythm Exercises',
    desc: 'Improve your timing with tap-along rhythm tests that train you to hold steady tempo and recognize complex subdivisions.',
    color: '#7B61FF',
  },
  {
    icon: '👂',
    title: 'Ear Training',
    desc: 'Enhance your musical hearing. Practice identifying intervals, chord progressions, and melodic patterns by ear.',
    color: '#FF8A00',
  },
  {
    icon: '🏆',
    title: 'Performance Scoring',
    desc: 'Compete with yourself! Earn accuracy percentages and points to track your technical execution over time.',
    color: '#FF4FA3',
  },
  {
    icon: '📈',
    title: 'Progress Tracking',
    desc: 'Visualize your daily practice statistics, milestones, and transcription volume in an elegant, personalized dashboard.',
    color: '#7B61FF',
  },
];

export function FutureVisionSection() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const isTablet = width >= 600 && width < 900;

  // Animation values for glowing lines
  const pulseAnim = useSharedValue(0.5);

  useEffect(() => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 2500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const lineGlowStyle = useAnimatedStyle(() => ({
    opacity: pulseAnim.value,
  }));

  const getWidthStyle = () => {
    if (isDesktop) return styles.width30;
    if (isTablet) return styles.width45;
    return styles.width100;
  };

  return (
    <View style={styles.container}>
      {/* Background connecting lines for Desktop */}
      {isDesktop && (
        <Animated.View style={[styles.svgLinesOverlay, lineGlowStyle]}>
          <Svg height="100%" width="100%" viewBox="0 0 1200 600" preserveAspectRatio="none">
            <Defs>
              <SvgGradient id="glowGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#FF8A00" stopOpacity="0.4" />
                <Stop offset="50%" stopColor="#FF4FA3" stopOpacity="0.4" />
                <Stop offset="100%" stopColor="#7B61FF" stopOpacity="0.4" />
              </SvgGradient>
            </Defs>

            {/* Glowing lines linking sections */}
            <Path
              d="M 200 120 H 1000 V 480 H 200 Z"
              fill="none"
              stroke="url(#glowGrad1)"
              strokeWidth={2}
              strokeDasharray="8 6"
            />
            <Path
              d="M 600 50 V 550"
              fill="none"
              stroke="url(#glowGrad1)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          </Svg>
        </Animated.View>
      )}

      <Text style={styles.sectionTitle}>Beyond Transcription</Text>
      <Text style={styles.sectionSubtitle}>
        MeloNote is expanding into an all-in-one learning suite. Here is a look at what we are building to help you master music.
      </Text>

      <View style={styles.grid}>
        {items.map((item, idx) => (
          <Animated.View
            key={idx}
            entering={FadeInUp.delay(idx * 100).duration(600)}
            style={[styles.card, getWidthStyle()]}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.iconBox, { borderColor: item.color + '40', backgroundColor: item.color + '10' }]}>
                <Text style={styles.iconText}>{item.icon}</Text>
              </View>
              <View style={[styles.glowDot, { backgroundColor: item.color }]} />
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardDesc}>{item.desc}</Text>
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
    backgroundColor: '#0F0F12',
    position: 'relative',
    overflow: 'hidden',
  },
  svgLinesOverlay: {
    position: 'absolute',
    left: 0,
    top: 150,
    right: 0,
    bottom: 50,
    zIndex: 1,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
    zIndex: 2,
    fontFamily: 'var(--font-display)',
  },
  sectionSubtitle: {
    color: '#B0B4BA',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 600,
    marginBottom: 60,
    zIndex: 2,
  },
  grid: {
    width: '100%',
    maxWidth: 1200,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 24,
    zIndex: 2,
  },
  width30: {
    width: '30%', // 3 columns on desktop
  },
  width45: {
    width: '45%', // 2 columns on tablet
  },
  width100: {
    width: '100%', // 1 column on mobile
    maxWidth: 400,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    padding: 28,
    alignItems: 'flex-start',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(30px)',
        transition: 'all 0.3s ease',
        cursor: 'pointer',
        ':hover': {
          transform: 'scale(1.03)',
          borderColor: 'rgba(255, 255, 255, 0.12)',
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
        },
      },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 22,
  },
  glowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
    fontFamily: 'var(--font-display)',
  },
  cardDesc: {
    color: '#B0B4BA',
    fontSize: 14,
    lineHeight: 20,
  },
});
