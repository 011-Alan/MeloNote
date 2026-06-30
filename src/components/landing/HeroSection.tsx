import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path, Circle, G, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

// Custom icons/SVGs or simple paths
const TrebleClefSvg = () => (
  <Svg viewBox="0 0 100 150" width={60} height={90}>
    <Path
      d="M35 135 C35 145, 50 145, 50 135 C50 120, 38 115, 30 110 C20 102, 15 90, 15 75 C15 45, 40 20, 50 5 C52 2, 55 2, 55 5 L55 125 C55 135, 62 140, 70 140 C80 140, 85 130, 85 120 C85 105, 72 98, 65 98 C60 98, 55 100, 55 105 C55 110, 58 112, 60 112 C62 112, 65 110, 65 106 C65 103, 62 101, 58 101 L58 55 C65 65, 75 75, 75 88 C75 102, 65 115, 52 118 L52 35 C42 45, 30 60, 30 78 C30 92, 38 102, 45 108 C48 110, 52 112, 52 115 L52 128 C45 128, 35 125, 35 135 Z"
      fill="url(#clefGrad)"
    />
    <Defs>
      <SvgGradient id="clefGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#FF8A00" />
        <Stop offset="50%" stopColor="#FF4FA3" />
        <Stop offset="100%" stopColor="#7B61FF" />
      </SvgGradient>
    </Defs>
  </Svg>
);

interface HeroSectionProps {
  onGetStarted: () => void;
  onWatchDemo: () => void;
}

export function HeroSection({ onGetStarted, onWatchDemo }: HeroSectionProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 800;

  // Animation values
  const floatAnim = useSharedValue(0);
  const blob1AnimX = useSharedValue(0);
  const blob1AnimY = useSharedValue(0);
  const blob2AnimX = useSharedValue(0);
  const blob2AnimY = useSharedValue(0);
  const waveProgress = useSharedValue(0);

  useEffect(() => {
    floatAnim.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 3000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    blob1AnimX.value = withRepeat(
      withSequence(
        withTiming(40, { duration: 8000, easing: Easing.inOut(Easing.ease) }),
        withTiming(-40, { duration: 8000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    blob1AnimY.value = withRepeat(
      withSequence(
        withTiming(-30, { duration: 9000, easing: Easing.inOut(Easing.ease) }),
        withTiming(30, { duration: 9000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    blob2AnimX.value = withRepeat(
      withSequence(
        withTiming(-50, { duration: 10000, easing: Easing.inOut(Easing.ease) }),
        withTiming(50, { duration: 10000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    blob2AnimY.value = withRepeat(
      withSequence(
        withTiming(40, { duration: 8500, easing: Easing.inOut(Easing.ease) }),
        withTiming(-40, { duration: 8500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    waveProgress.value = withRepeat(
      withTiming(1, { duration: 4000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const animatedClefStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: floatAnim.value * -15 },
        { rotate: `${floatAnim.value * 4 - 2}deg` },
      ],
    };
  });

  const blob1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: blob1AnimX.value }, { translateY: blob1AnimY.value }],
  }));

  const blob2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: blob2AnimX.value }, { translateY: blob2AnimY.value }],
  }));

  // Render 5 wavy staff lines where left starts as a chaotic waveform and right smooths out into straight staff lines.
  const generateWavyStaffPaths = () => {
    const lines = [];
    const baseHeight = 150;
    const spacing = 14;
    const startY = 40;

    for (let i = 0; i < 5; i++) {
      const y = startY + i * spacing;
      lines.push({
        id: i,
        y,
      });
    }
    return lines;
  };

  const staffLines = generateWavyStaffPaths();

  return (
    <View style={styles.container}>
      {/* Background Animated Blobs */}
      <Animated.View style={[styles.blob, styles.blob1, blob1Style]}>
        <LinearGradient
          colors={['rgba(255, 138, 0, 0.25)', 'rgba(255, 79, 163, 0.25)']}
          style={styles.gradientFill}
        />
      </Animated.View>
      <Animated.View style={[styles.blob, styles.blob2, blob2Style]}>
        <LinearGradient
          colors={['rgba(123, 97, 255, 0.22)', 'rgba(255, 79, 163, 0.22)']}
          style={styles.gradientFill}
        />
      </Animated.View>

      <View style={[styles.content, isDesktop ? styles.row : styles.column]}>
        {/* Left Side: Headline and copy */}
        <View style={[styles.textBlock, isDesktop ? styles.width50 : styles.width100]}>
          <Text style={styles.badgeText}>INTRODUCING MELONOTE AI</Text>
          <Text style={styles.title}>
            Transform Music into{' '}
            <Text style={styles.gradientText}>Digital Sheet Music</Text> with AI
          </Text>
          <Text style={styles.subtitle}>
            Upload recordings, compose from scratch, or scan printed sheet music into editable digital
            scores—all in one intelligent workspace.
          </Text>

          <View style={styles.btnRow}>
            <Pressable onPress={onGetStarted} style={styles.ctaPrimary}>
              <LinearGradient
                colors={['#FF8A00', '#FF4FA3', '#7B61FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaPrimaryGradient}
              >
                <Text style={styles.ctaPrimaryText}>Get Started</Text>
              </LinearGradient>
            </Pressable>

            <Pressable onPress={onWatchDemo} style={styles.ctaSecondary}>
              <Text style={styles.ctaSecondaryText}>Watch Demo</Text>
            </Pressable>
          </View>
        </View>

        {/* Right Side: Animated Illustration */}
        <View style={[styles.illustrationBlock, isDesktop ? styles.width50 : styles.width100]}>
          <Animated.View style={[styles.illustrationContainer, animatedClefStyle]}>
            {/* SVG staff wave overlay */}
            <View style={styles.svgContainer}>
              <Svg viewBox="0 0 400 250" width="100%" height="100%">
                <Defs>
                  <SvgGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <Stop offset="0%" stopColor="#FF8A00" stopOpacity="0.8" />
                    <Stop offset="50%" stopColor="#FF4FA3" stopOpacity="0.8" />
                    <Stop offset="100%" stopColor="#7B61FF" stopOpacity="0.9" />
                  </SvgGradient>
                  <SvgGradient id="glowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <Stop offset="0%" stopColor="#FF8A00" stopOpacity="0.3" />
                    <Stop offset="100%" stopColor="#7B61FF" stopOpacity="0.3" />
                  </SvgGradient>
                </Defs>

                {/* Animated Waveform Transforming to Sheet Music */}
                {staffLines.map((line) => {
                  const y = line.y;
                  return (
                    <React.Fragment key={line.id}>
                      {/* Glow backing */}
                      <Path
                        d={`M 10 ${y + Math.sin(0) * 15} Q 60 ${y - 25} 120 ${y + 20} T 240 ${y} T 390 ${y}`}
                        fill="none"
                        stroke="url(#glowGrad)"
                        strokeWidth={8}
                        strokeLinecap="round"
                      />
                      {/* Sharp path line */}
                      <Path
                        d={`M 10 ${y + Math.sin(line.id) * 15} Q 60 ${y - 20} 120 ${y + 15} T 240 ${y} T 390 ${y}`}
                        fill="none"
                        stroke="url(#waveGrad)"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                      />
                    </React.Fragment>
                  );
                })}

                {/* Waveform dots on the left */}
                <G opacity={0.65}>
                  <Circle cx={40} cy={100} r={4} fill="#FF8A00" />
                  <Circle cx={30} cy={80} r={3} fill="#FF4FA3" />
                  <Circle cx={50} cy={130} r={3.5} fill="#7B61FF" />
                  <Circle cx={60} cy={60} r={2} fill="#FF8A00" />
                  <Circle cx={20} cy={120} r={3.5} fill="#7B61FF" />
                </G>

                {/* Notes floating on the right side */}
                <G opacity={0.85}>
                  {/* Note 1 */}
                  <G transform="translate(260, 80)">
                    <Circle cx={0} cy={0} r={6} fill="#FF4FA3" />
                    <Path d="M 5 0 L 5 -20 L 15 -18 L 15 -8 L 5 -10" fill="#FF4FA3" />
                  </G>
                  {/* Note 2 */}
                  <G transform="translate(320, 110)">
                    <Circle cx={0} cy={0} r={5} fill="#7B61FF" />
                    <Path d="M 4 0 L 4 -18 L 12 -18" fill="none" stroke="#7B61FF" strokeWidth={2} />
                  </G>
                  {/* Note 3 */}
                  <G transform="translate(180, 130)">
                    <Circle cx={0} cy={0} r={5.5} fill="#FF8A00" />
                    <Path d="M 5 0 L 5 -18" fill="none" stroke="#FF8A00" strokeWidth={2} />
                  </G>
                </G>
              </Svg>
            </View>

            {/* Treble Clef overlay */}
            <View style={styles.clefOverlay}>
              <TrebleClefSvg />
            </View>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 80,
    position: 'relative',
    overflow: 'hidden',
  },
  content: {
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 24,
    gap: 40,
    zIndex: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  column: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  width50: {
    width: '50%',
  },
  width100: {
    width: '100%',
  },
  textBlock: {
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 16,
  },
  badgeText: {
    color: '#FF4FA3',
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: Platform.OS === 'web' ? 52 : 36,
    fontWeight: '800',
    lineHeight: Platform.OS === 'web' ? 62 : 44,
    fontFamily: 'var(--font-display)',
  },
  gradientText: {
    color: '#FF8A00',
  },
  subtitle: {
    color: '#B0B4BA',
    fontSize: 18,
    lineHeight: 28,
    marginVertical: 8,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
  },
  ctaPrimary: {
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#FF4FA3',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  ctaPrimaryGradient: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPrimaryText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  ctaSecondary: {
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaSecondaryText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  illustrationBlock: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  illustrationContainer: {
    width: '100%',
    maxWidth: 480,
    height: 320,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    position: 'relative',
    overflow: 'visible',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
      },
    }),
  },
  svgContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clefOverlay: {
    position: 'absolute',
    left: 40,
    top: '30%',
    shadowColor: '#FF4FA3',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
  },
  blob: {
    position: 'absolute',
    borderRadius: 200,
    width: 320,
    height: 320,
    zIndex: 1,
    ...Platform.select({
      web: {
        filter: 'blur(100px)',
      },
    }),
  },
  blob1: {
    left: -100,
    top: -50,
  },
  blob2: {
    right: -100,
    bottom: -50,
  },
  gradientFill: {
    flex: 1,
    borderRadius: 200,
  },
});
