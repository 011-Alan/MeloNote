import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path, Circle, G, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

export function MobileHero() {
  const floatAnim = useSharedValue(0);
  const waveProgress = useSharedValue(0);
  const glowOpacity = useSharedValue(0.4);

  useEffect(() => {
    floatAnim.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 3000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    waveProgress.value = withRepeat(
      withTiming(1, { duration: 5000, easing: Easing.linear }),
      -1,
      false
    );

    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 2000 }),
        withTiming(0.3, { duration: 2000 })
      ),
      -1,
      true
    );
  }, []);

  const animatedStaffStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: floatAnim.value * -8 },
      ],
    };
  });

  const generateWavePath = (offset: number) => {
    // Generates a smooth wavy path that looks like a musical staff line
    // We will draw it across 320px width
    const baseHeight = 90;
    const spacing = 12;
    const y = baseHeight + offset * spacing;
    return `M 10 ${y} Q 80 ${y - 20} 160 ${y} T 310 ${y}`;
  };

  return (
    <View style={styles.container}>
      {/* Soft animated gradient background */}
      <LinearGradient
        colors={['#0F0F12', '#0A0A0C']}
        style={StyleSheet.absoluteFill}
      />
      
      {/* Animated gradient blob in background */}
      <View style={styles.blurBlob}>
        <LinearGradient
          colors={['rgba(255, 138, 0, 0.12)', 'rgba(255, 79, 163, 0.12)', 'rgba(123, 97, 255, 0.12)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.blobFill}
        />
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>MeloNote</Text>
        <Text style={styles.subtitle}>Create • Transcribe • Scan • Learn</Text>

        {/* Floating Waving Musical Staff Graphic */}
        <Animated.View style={[styles.canvasContainer, animatedStaffStyle]}>
          <Svg width="100%" height="100%" viewBox="0 0 320 180">
            <Defs>
              <SvgGradient id="staffLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor="#FF8A00" />
                <Stop offset="50%" stopColor="#FF4FA3" />
                <Stop offset="100%" stopColor="#7B61FF" />
              </SvgGradient>
              <SvgGradient id="sheetGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor="rgba(255,255,255,0.01)" />
                <Stop offset="100%" stopColor="rgba(255,255,255,0.15)" />
              </SvgGradient>
            </Defs>

            {/* Glowing staff lines */}
            {[0, 1, 2, 3, 4].map((offset) => (
              <Path
                key={offset}
                d={generateWavePath(offset)}
                fill="none"
                stroke="url(#staffLineGrad)"
                strokeWidth={1.8}
                strokeLinecap="round"
              />
            ))}

            {/* Digital Sheet Music Preview container on the right */}
            <G opacity={0.8} translate="220, 45}">
              {/* Semi-transparent glass sheet card preview */}
              <Path
                d="M 5 10 h 75 v 90 h -75 z"
                fill="url(#sheetGrad)"
                stroke="rgba(255, 255, 255, 0.12)"
                strokeWidth={1}
              />
              {/* Little notes inside */}
              <Circle cx={20} cy={35} r={3} fill="#FFFFFF" />
              <Path d="M 23 35 L 23 20" stroke="#FFFFFF" strokeWidth={1} />
              <Circle cx={40} cy={45} r={3} fill="#FFFFFF" />
              <Path d="M 43 45 L 43 30" stroke="#FFFFFF" strokeWidth={1} />
              <Circle cx={60} cy={28} r={3} fill="#FFFFFF" />
              <Path d="M 63 28 L 63 13" stroke="#FFFFFF" strokeWidth={1} />
            </G>

            {/* Traveling Notes on Left to Center */}
            <G opacity={0.95}>
              <Circle cx={65} cy={82} r={4.5} fill="#FF8A00" />
              <Path d="M 69.5 82 L 69.5 67" stroke="#FF8A00" strokeWidth={1.5} />
              
              <Circle cx={130} cy={100} r={4.5} fill="#FF4FA3" />
              <Path d="M 134.5 100 L 134.5 85 L 142.5 87" fill="none" stroke="#FF4FA3" strokeWidth={1.5} />

              <Circle cx={185} cy={95} r={4} fill="#7B61FF" />
              <Path d="M 189 95 L 189 80" stroke="#7B61FF" strokeWidth={1.5} />
            </G>

            {/* Floating Sparkles & Particles */}
            <Circle cx={45} cy={60} r={2.5} fill="#FFFFFF" opacity={0.6} />
            <Circle cx={100} cy={130} r={1.5} fill="#FFFFFF" opacity={0.4} />
            <Circle cx={160} cy={55} r={2} fill="#FF4FA3" opacity={0.8} />
            <Circle cx={210} cy={135} r={2.5} fill="#FF8A00" opacity={0.6} />
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingTop: 36,
    paddingBottom: 24,
    position: 'relative',
    overflow: 'hidden',
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
  },
  blurBlob: {
    position: 'absolute',
    left: '10%',
    top: '15%',
    width: 280,
    height: 280,
    borderRadius: 140,
    zIndex: 1,
    ...Platform.select({
      web: {
        filter: 'blur(80px)',
      },
    }),
  },
  blobFill: {
    flex: 1,
    borderRadius: 140,
  },
  content: {
    alignItems: 'center',
    zIndex: 2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.5,
    fontFamily: Platform.OS === 'web' ? 'var(--font-rounded)' : 'System',
    marginBottom: 4,
  },
  subtitle: {
    color: '#B0B4BA',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  canvasContainer: {
    width: '90%',
    maxWidth: 360,
    height: 185,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(10px)',
      },
    }),
  },
});
