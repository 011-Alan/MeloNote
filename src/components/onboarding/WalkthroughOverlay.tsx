import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  Easing,
  FadeIn,
  FadeOut,
  runOnJS
} from 'react-native-reanimated';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import { useSettings } from '@/context/SettingsContext';
import { WalkthroughSteps } from './WalkthroughConfig';
import { WalkthroughRegistry } from './WalkthroughRegistry';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

interface WalkthroughOverlayProps {
  onComplete: () => void;
}

export function WalkthroughOverlay({ onComplete }: WalkthroughOverlayProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [showCompletion, setShowCompletion] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0, position: 'center' });
  const [tooltipSize, setTooltipSize] = useState({ w: 0, h: 0 });
  const [containerOffset, setContainerOffset] = useState({ x: 0, y: 0 });

  const { theme } = useSettings();
  const isDark = theme === 'dark';
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const step = WalkthroughSteps[currentStepIndex];

  // Reanimated Shared Values for Spotlight
  const spotlightX = useSharedValue(0);
  const spotlightY = useSharedValue(0);
  const spotlightW = useSharedValue(0);
  const spotlightH = useSharedValue(0);
  const spotlightOpacity = useSharedValue(0);

  // Pulse effect shared value
  const pulseVal = useSharedValue(1);

  // Tooltip animation shared values
  const tooltipOpacity = useSharedValue(0);
  const tooltipTranslateY = useSharedValue(15);

  const containerRef = useRef<View>(null);

  // Pulse animation loop
  useEffect(() => {
    pulseVal.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  // Measure self offset to support SafeArea offsets
  const measureContainer = () => {
    if (containerRef.current) {
      containerRef.current.measure((x, y, w, h, pageX, pageY) => {
        if (w > 0 && h > 0) {
          setContainerOffset({ x: pageX, y: pageY });
        }
      });
    }
  };

  const scrollToElement = (element: any) => {
    const scrollView = WalkthroughRegistry.get('active-scrollview');
    if (!scrollView || !element) return;

    if (Platform.OS === 'web') {
      try {
        (element as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (e) {}
    } else {
      try {
        (element as any).measureLayout(
          scrollView,
          (x: number, y: number, w: number, h: number) => {
            const scrollY = Math.max(0, y - 100);
            (scrollView as any).scrollTo({ y: scrollY, animated: true });
          },
          () => {}
        );
      } catch (e) {}
    }
  };

  const measureElement = () => {
    if (!step?.highlightId) {
      setSpotlight(null);
      return;
    }

    const element = WalkthroughRegistry.get(step.highlightId);
    if (!element) {
      setTimeout(measureElement, 150);
      return;
    }

    const handleMeasurement = (pageX: number, pageY: number, width: number, height: number) => {
      if (width === 0 || height === 0) {
        setTimeout(measureElement, 150);
        return;
      }

      // Convert global pageX/Y to parent-relative coords using measured container offset
      const relX = pageX - containerOffset.x;
      const relY = pageY - containerOffset.y;

      setSpotlight({ x: relX, y: relY, w: width, h: height });
    };

    // Auto scroll to element before measuring
    scrollToElement(element);

    // Wait a brief moment for scroll animation to settle
    setTimeout(() => {
      if (Platform.OS === 'web') {
        try {
          const rect = (element as HTMLElement).getBoundingClientRect();
          handleMeasurement(rect.left, rect.top, rect.width, rect.height);
        } catch (e) {
          setTimeout(measureElement, 150);
        }
      } else {
        try {
          (element as any).measure((x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
            handleMeasurement(pageX, pageY, width, height);
          });
        } catch (e) {
          setTimeout(measureElement, 150);
        }
      }
    }, 350);
  };

  // Route and Step changes handler
  useEffect(() => {
    if (!step) return;

    // Fade out current tooltip first
    tooltipOpacity.value = withTiming(0, { duration: 150 });
    tooltipTranslateY.value = withTiming(15, { duration: 150 });

    const proceedToStep = () => {
      measureContainer();
      measureElement();
    };

    if (pathname !== step.route) {
      setSpotlight(null); // Hide highlight instantly
      spotlightOpacity.value = withTiming(0, { duration: 150 });
      router.push(step.route as any);
      // Wait for route change, view mounting and layout rendering
      setTimeout(proceedToStep, 900);
    } else {
      setTimeout(proceedToStep, 100);
    }
  }, [currentStepIndex, step, pathname, containerOffset.x]);

  // Animate spotlight coords when resolved
  useEffect(() => {
    if (spotlight) {
      // Smoothly animate the spotlight mask coordinates - snappier spring
      spotlightX.value = withSpring(spotlight.x, { damping: 18, stiffness: 180 });
      spotlightY.value = withSpring(spotlight.y, { damping: 18, stiffness: 180 });
      spotlightW.value = withSpring(spotlight.w, { damping: 18, stiffness: 180 });
      spotlightH.value = withSpring(spotlight.h, { damping: 18, stiffness: 180 });
      spotlightOpacity.value = withTiming(1, { duration: 200 });

      // Animate tooltip fade-in after highlight settles faster
      setTimeout(() => {
        tooltipOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) });
        tooltipTranslateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.quad) });
      }, 220);
    } else {
      spotlightOpacity.value = withTiming(0, { duration: 150 });
      // Center tooltip fade-in directly
      setTimeout(() => {
        tooltipOpacity.value = withTiming(1, { duration: 200 });
        tooltipTranslateY.value = withTiming(0, { duration: 200 });
      }, 100);
    }
  }, [spotlight]);

  // Recalculate tooltip position when spotlight, size, or safe area changes
  useEffect(() => {
    const screenWidth = Dimensions.get('window').width;
    const screenHeight = Dimensions.get('window').height;

    const pad = 16;
    const safeTop = Math.max(insets.top, 20) + pad;
    const safeBottom = Math.max(insets.bottom, 20) + pad;
    const safeLeft = insets.left + pad;
    const safeRight = insets.right + pad;

    const tW = tooltipSize.w || 340;
    const tH = tooltipSize.h || 180;

    if (!spotlight) {
      // Center positioning fallback
      const left = Math.max(safeLeft, (screenWidth - tW) / 2);
      const top = Math.max(safeTop, (screenHeight - tH) / 2 - 20);
      setTooltipPos({ top, left, position: 'center' });
      return;
    }

    const spaceAbove = spotlight.y - safeTop;
    const spaceBelow = screenHeight - safeBottom - (spotlight.y + spotlight.h);

    let idealY = 0;
    let position = 'below';

    // Decide vertical position
    if (step.tooltipPosition === 'top' || (spaceAbove > spaceBelow && spaceBelow < tH + 24)) {
      idealY = spotlight.y - tH - 12;
      position = 'above';

      if (idealY < safeTop) {
        idealY = safeTop;
      }
    } else {
      idealY = spotlight.y + spotlight.h + 12;
      position = 'below';

      if (idealY + tH > screenHeight - safeBottom) {
        if (spaceAbove > spaceBelow) {
          idealY = Math.max(safeTop, spotlight.y - tH - 12);
          position = 'above';
        } else {
          idealY = screenHeight - safeBottom - tH;
        }
      }
    }

    // Horizontal centering
    let idealX = spotlight.x + (spotlight.w - tW) / 2;

    // Clamp horizontally within screen safe areas
    if (idealX < safeLeft) {
      idealX = safeLeft;
    } else if (idealX + tW > screenWidth - safeRight) {
      idealX = screenWidth - safeRight - tW;
    }

    setTooltipPos({ top: idealY, left: idealX, position });
  }, [spotlight, tooltipSize, insets]);

  const handleNext = () => {
    if (currentStepIndex < WalkthroughSteps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      // Smooth finish transition
      tooltipOpacity.value = withTiming(0, { duration: 150 }, () => {
        runOnJS(setShowCompletion)(true);
      });
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  // Reanimated style for the spotlight mask properties
  const animatedMaskProps = useAnimatedProps(() => {
    return {
      x: spotlightX.value - 6,
      y: spotlightY.value - 6,
      width: spotlightW.value + 12,
      height: spotlightH.value + 12,
      rx: 12,
      ry: 12,
    };
  });

  // Reanimated style for the animated border outline
  const animatedBorderStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      left: spotlightX.value - 6,
      top: spotlightY.value - 6,
      width: spotlightW.value + 12,
      height: spotlightH.value + 12,
      opacity: spotlightOpacity.value,
      transform: [{ scale: pulseVal.value }],
    };
  });

  // Reanimated style for the tooltip container (fade + slide up)
  const animatedTooltipStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      top: tooltipPos.top,
      left: tooltipPos.left,
      width: tooltipSize.w || 340,
      opacity: tooltipOpacity.value,
      transform: [{ translateY: tooltipTranslateY.value }],
    };
  });

  if (showCompletion) {
    return (
      <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.82)' }]}>
        <View style={[styles.completionModal, { backgroundColor: isDark ? '#1c1c1e' : '#ffffff' }]}>
          <Text style={styles.completionEmoji}>🎉</Text>
          <Text style={[styles.completionTitle, { color: isDark ? '#ffffff' : '#121212' }]}>You're all set!</Text>
          <Text style={[styles.completionText, { color: isDark ? '#8e8e93' : '#60646C' }]}>
            We hope you find MeloNote useful and enjoy creating, editing, and discovering music.{"\n\n"}
            Happy composing!
          </Text>
          <Pressable onPress={onComplete} style={styles.finishButton}>
            <Text style={styles.finishButtonText}>Get Started</Text>
          </Pressable>
        </View>
      </Animated.View>
    );
  }

  return (
    <View
      ref={containerRef}
      onLayout={measureContainer}
      style={styles.overlay}
      pointerEvents="box-none"
    >
      {/* Dimmed backdrop with spotlight cutout */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <Mask id="spotlightMask">
            <Rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spotlight && (
              <AnimatedRect
                animatedProps={animatedMaskProps}
                fill="black"
              />
            )}
          </Mask>
        </Defs>
        <Rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.74)"
          mask="url(#spotlightMask)"
        />
      </Svg>

      {/* Pulsing Spotlight Border Outline with shadow glow */}
      {spotlight && (
        <Animated.View style={[styles.spotlightBorder, animatedBorderStyle]} pointerEvents="none" />
      )}

      {/* Floating Tooltip Box */}
      {step && (
        <Animated.View style={animatedTooltipStyle} pointerEvents="box-none">
          <View
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              if (width > 0 && height > 0) {
                setTooltipSize({ w: width, h: height });
              }
            }}
            style={[styles.tooltip, { backgroundColor: isDark ? '#1c1c1e' : '#ffffff', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
          >
            <Text style={[styles.tooltipTitle, { color: isDark ? '#ffffff' : '#121212' }]}>{step.title}</Text>
            <Text style={[styles.tooltipDesc, { color: isDark ? '#B0B4BA' : '#555555' }]}>{step.description}</Text>

            <View style={styles.footer}>
              <Text style={styles.progressText}>
                {currentStepIndex + 1} of {WalkthroughSteps.length}
              </Text>

              <View style={styles.controls}>
                {currentStepIndex > 0 && (
                  <Pressable onPress={handlePrev} style={[styles.controlBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                    <Text style={[styles.controlText, { color: isDark ? '#FFFFFF' : '#121212' }]}>Previous</Text>
                  </Pressable>
                )}
                <Pressable onPress={handleNext} style={[styles.controlBtn, styles.primaryBtn]}>
                  <Text style={styles.primaryBtnText}>
                    {currentStepIndex === WalkthroughSteps.length - 1 ? 'Finish' : 'Next'}
                  </Text>
                </Pressable>
              </View>
            </View>

            <Pressable onPress={onComplete} style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip Tour</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill as object,
    zIndex: 9999,
  },
  spotlightBorder: {
    borderWidth: 2.5,
    borderColor: '#FF4FA3',
    borderRadius: 12,
    shadowColor: '#FF4FA3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  tooltip: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  tooltipTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  tooltipDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressText: {
    fontSize: 12,
    color: '#8e8e93',
    fontWeight: '700',
  },
  controls: {
    flexDirection: 'row',
    gap: 8,
  },
  controlBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlText: {
    fontWeight: '600',
    fontSize: 13,
  },
  primaryBtn: {
    backgroundColor: '#FF4FA3',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  skipBtn: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    color: '#8e8e93',
    fontSize: 13,
    fontWeight: '600',
  },
  completionModal: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 10,
  },
  completionEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  completionTitle: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 16,
  },
  completionText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  finishButton: {
    width: '100%',
    height: 50,
    backgroundColor: '#FF8A00',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  finishButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
