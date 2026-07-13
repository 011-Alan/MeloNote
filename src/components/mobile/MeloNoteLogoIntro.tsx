import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Platform, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import Svg, { Text as SvgText, Defs, LinearGradient as SvgGradient, Stop, TSpan } from 'react-native-svg';
import { useSettings } from '@/context/SettingsContext';
import { useAudioPlayer } from 'expo-audio';

const { width: W } = Dimensions.get('window');

export function MeloNoteLogoIntro({ onComplete }: { onComplete: () => void }) {
  const { theme } = useSettings();
  const isDark = theme === 'dark';

  // Instantiate the local string-triplet sound player
  const player = useAudioPlayer(require('../../../assets/splash_sound.wav'));

  // Shared animation values
  const titleOpacity = useSharedValue(0);
  const subtextOpacity = useSharedValue(0);
  const subtextTranslateX = useSharedValue(60); // Starts shifted to the right
  const fadeProgress = useSharedValue(1);       // Overall splash opacity

  useEffect(() => {
    // 1. MeloNote title fades in immediately
    titleOpacity.value = withTiming(1, {
      duration: 2200,
      easing: Easing.out(Easing.quad),
    });

    // Play strings triplet F-C-F starting at 1.0s (building up until tagline enters at 2.0s)
    const soundTimer = setTimeout(() => {
      try {
        player.play();
      } catch (err) {
        console.warn("Failed to play splash sound:", err);
      }
    }, 1000);

    // 2. Subtitle "YOUR MUSIC WORKSPACE" slides and fades in after 2 seconds
    const subtitleTimer = setTimeout(() => {
      subtextOpacity.value = withTiming(1, {
        duration: 1200,
        easing: Easing.out(Easing.quad),
      });
      subtextTranslateX.value = withTiming(0, {
        duration: 1200,
        easing: Easing.out(Easing.quad),
      });
    }, 2000);

    // 3. Final screen fade out starts at 6.5s and completes at 7s (total 7 seconds)
    const fadeOutTimer = setTimeout(() => {
      fadeProgress.value = withTiming(
        0,
        { duration: 500, easing: Easing.out(Easing.quad) },
        (finished) => {
          if (finished) {
            runOnJS(onComplete)();
          }
        }
      );
    }, 6500);

    return () => {
      clearTimeout(soundTimer);
      clearTimeout(subtitleTimer);
      clearTimeout(fadeOutTimer);
      try {
        player.pause();
      } catch (_) {}
    };
  }, []);

  // Animated styles
  const mainContainerStyle = useAnimatedStyle(() => ({
    opacity: fadeProgress.value,
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ scale: withTiming(titleOpacity.value === 1 ? 1 : 0.95, { duration: 2200 }) }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtextOpacity.value,
    transform: [{ translateX: subtextTranslateX.value }],
  }));

  const bgColors = isDark ? ['#0F0F12', '#050507'] : ['#F9F9FA', '#F0F0F3'];
  const subtextColor = isDark ? '#FFFFFF' : '#121212';

  return (
    <Animated.View style={[styles.overlay, mainContainerStyle]}>
      {/* Background Gradient */}
      <LinearGradient colors={bgColors as any} style={StyleSheet.absoluteFill} />

      <View style={styles.centerContainer}>
        {/* Title Section without Glow */}
        <Animated.View style={[styles.titleWrapper, titleStyle]}>
        {/* Foreground SVG Text containing the orange-pink-purple gradient fill */}
          <Svg height={130} width={W}>
            <Defs>
              <SvgGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor="#FF8A00" />
                <Stop offset="50%" stopColor="#FF4FA3" />
                <Stop offset="100%" stopColor="#7B61FF" />
              </SvgGradient>
            </Defs>
            <SvgText
              fill="url(#logoGrad)"
              fontSize={54}
              fontFamily="Antipasto Pro"
              fontWeight="900"
              x="50%"
              y="85"
              textAnchor="middle"
            >
              MeloNote
            <SvgText
              fill="url(#logoGrad)"
              fontSize={18}
              fontFamily="System"
              x="50%"
              dx={125}
              y="60"
              textAnchor="start"
            >
              ©
            </SvgText>
            </SvgText>
            
          </Svg>
        </Animated.View>

        {/* Sliding Tagline Section */}
        <Animated.View style={[styles.taglineContainer, subtitleStyle]}>
          <Text style={[styles.taglineText, { color: subtextColor }]}>
            YOUR MUSIC WORKSPACE
          </Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  titleWrapper: {
    height: 130,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  taglineContainer: {
    marginTop: 10,
    alignItems: 'center',
  },
  taglineText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 7,
    fontFamily: Platform.OS === 'web' ? 'var(--font-rounded)' : 'System',
    opacity: 0.9,
  },
});
