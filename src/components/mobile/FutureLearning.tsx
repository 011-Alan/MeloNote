import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
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

interface ComingSoonItem {
  icon: string;
  title: string;
  desc: string;
  colors: [string, string];
}

const items: ComingSoonItem[] = [
  {
    icon: '🎯',
    title: 'AI Practice Evaluation',
    desc: 'Play your instrument and get instant feedback on rhythm & accuracy.',
    colors: ['#FF8A00', '#FF4FA3'],
  },
  {
    icon: '🎵',
    title: 'Ear Training',
    desc: 'Train your musical hearing to identify intervals, chords, & keys.',
    colors: ['#FF4FA3', '#7B61FF'],
  },
  {
    icon: '🧠',
    title: 'Music Theory Quizzes',
    desc: 'Fun, gamified exercises to test your sight-reading & notation theory.',
    colors: ['#7B61FF', '#FF8A00'],
  },
  {
    icon: '📈',
    title: 'Progress Tracking',
    desc: 'Visualize stats, frequency, and accuracy dashboards in real-time.',
    colors: ['#FF8A00', '#7B61FF'],
  },
];

export function FutureLearning() {
  const pulseAnim = useSharedValue(0.4);

  useEffect(() => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: pulseAnim.value,
  }));

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Future Learning (Coming Soon)</Text>
      
      <View style={styles.grid}>
        {items.map((item, idx) => (
          <Animated.View
            key={idx}
            entering={FadeInUp.delay(idx * 150).duration(600)}
            style={styles.cardWrapper}
          >
            {/* Glowing Backdrop Border */}
            <Animated.View style={[styles.glowBorder, glowStyle]}>
              <LinearGradient
                colors={item.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>

            {/* Main Glass Card */}
            <View style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <Text style={styles.icon}>{item.icon}</Text>
                <Text style={styles.comingSoonTag}>COMING SOON</Text>
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardDesc}>{item.desc}</Text>
            </View>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 20,
    marginTop: 32,
    paddingBottom: 40,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    letterSpacing: 0.3,
    fontFamily: Platform.OS === 'web' ? 'var(--font-display)' : 'System',
  },
  grid: {
    gap: 16,
    width: '100%',
  },
  cardWrapper: {
    position: 'relative',
    borderRadius: 24,
    padding: 1.5, // acts as border width
    overflow: 'hidden',
  },
  glowBorder: {
    ...StyleSheet.absoluteFill,
    borderRadius: 24,
  },
  cardContent: {
    backgroundColor: '#0F0F12',
    borderRadius: 22,
    padding: 20,
    zIndex: 2,
    ...Platform.select({
      web: {
        transition: 'background-color 0.2s ease',
        ':hover': {
          backgroundColor: '#131318',
        },
      },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  icon: {
    fontSize: 22,
  },
  comingSoonTag: {
    color: '#7B61FF',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    backgroundColor: 'rgba(123, 97, 255, 0.1)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    fontFamily: Platform.OS === 'web' ? 'var(--font-display)' : 'System',
  },
  cardDesc: {
    color: '#B0B4BA',
    fontSize: 12,
    lineHeight: 16,
  },
});
