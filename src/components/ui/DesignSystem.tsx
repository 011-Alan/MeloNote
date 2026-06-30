import React from 'react';
import { StyleSheet, View, Text, Pressable, ViewStyle, TextStyle, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

// 1. GradientBackground
export function GradientBackground({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.bgContainer, style]}>
      <LinearGradient
        colors={['#0F0F12', '#050507']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.floatingCircle1} />
      <View style={styles.floatingCircle2} />
      {children}
    </View>
  );
}

// 2. GlassCard
export function GlassCard({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.glassCard, style]}>
      <View style={styles.glassBorderOverlay} />
      {children}
    </View>
  );
}

// 3. GradientCard
export function GradientCard({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <LinearGradient
      colors={['#FF8A00', '#FF4FA3', '#7B61FF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.gradientCard, style]}
    >
      {children}
    </LinearGradient>
  );
}

// 4. PrimaryButton
interface ButtonProps {
  title: string;
  onPress: () => void;
  icon?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
}

export function PrimaryButton({ title, onPress, icon, style, textStyle, disabled }: ButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.96);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btnContainer,
        disabled && styles.btnDisabled,
        style
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <LinearGradient
          colors={['#FF8A00', '#FF4FA3']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientButton}
        />
      </Animated.View>
      <View style={styles.btnContent}>
        {icon && <Ionicons name={icon as any} size={18} color="#FFFFFF" style={styles.btnIcon} />}
        <Text style={[styles.btnText, textStyle]}>{title}</Text>
      </View>
    </Pressable>
  );
}

// 5. SecondaryButton
export function SecondaryButton({ title, onPress, icon, style, textStyle, disabled }: ButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => (scale.value = withSpring(0.96))}
      onPressOut={() => (scale.value = withSpring(1))}
      disabled={disabled}
      style={[styles.btnContainer, disabled && styles.btnDisabled, style]}
    >
      <Animated.View style={[styles.secondaryButtonWrapper, animatedStyle]}>
        {icon && <Ionicons name={icon as any} size={18} color="#FF4FA3" style={styles.btnIcon} />}
        <Text style={[styles.secondaryBtnText, textStyle]}>{title}</Text>
      </Animated.View>
    </Pressable>
  );
}

// 6. SectionHeader
export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeaderContainer}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
  );
}

// 7. PageHeader
export function PageHeader({ title, subtitle, rightElement }: { title: string; subtitle?: string; rightElement?: React.ReactNode }) {
  return (
    <View style={styles.pageHeaderContainer}>
      <View style={styles.headerTextWrapper}>
        <Text style={styles.pageTitle}>{title}</Text>
        {subtitle && <Text style={styles.pageSubtitle}>{subtitle}</Text>}
      </View>
      {rightElement && <View>{rightElement}</View>}
    </View>
  );
}

// 8. MusicIconButton
export function MusicIconButton({ icon, onPress, style }: { icon: string; onPress: () => void; style?: ViewStyle }) {
  const scale = useSharedValue(1);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => (scale.value = withSpring(0.9))}
      onPressOut={() => (scale.value = withSpring(1))}
      style={style}
    >
      <Animated.View style={[styles.musicIconBtn, { transform: [{ scale: scale.value }] }]}>
        <Ionicons name={icon as any} size={22} color="#FFFFFF" />
      </Animated.View>
    </Pressable>
  );
}

// 9. EmptyState
export function EmptyState({ title, description, icon = 'musical-notes-outline' }: { title: string; description: string; icon?: string }) {
  return (
    <GlassCard style={styles.emptyStateContainer}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name={icon as any} size={36} color="#FF4FA3" />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDesc}>{description}</Text>
    </GlassCard>
  );
}

// 10. LoadingAnimation
export function LoadingAnimation({ message = 'Loading scores...' }: { message?: string }) {
  const rotation = useSharedValue(0);

  React.useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 1500 }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={styles.loadingContainer}>
      <Animated.View style={[styles.loadingCircle, animatedStyle]}>
        <LinearGradient
          colors={['#FF8A00', '#FF4FA3', '#7B61FF']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.loadingInnerMask} />
      </Animated.View>
      <Text style={styles.loadingMessage}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bgContainer: {
    flex: 1,
    backgroundColor: '#050507',
  },
  floatingCircle1: {
    position: 'absolute',
    left: -50,
    top: '20%',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(255, 138, 0, 0.05)',
  },
  floatingCircle2: {
    position: 'absolute',
    right: -50,
    bottom: '25%',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(123, 97, 255, 0.05)',
  },
  glassCard: {
    backgroundColor: 'rgba(45, 45, 45, 0.25)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  glassBorderOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    pointerEvents: 'none',
  },
  gradientCard: {
    borderRadius: 24,
    padding: 24,
    shadowColor: '#FF4FA3',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  btnContainer: {
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    position: 'relative',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  gradientButton: {
    flex: 1,
  },
  btnContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  btnIcon: {
    marginRight: 8,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButtonWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 20,
  },
  secondaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionHeaderContainer: {
    marginVertical: 15,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  sectionSubtitle: {
    color: '#8E929A',
    fontSize: 13,
    marginTop: 4,
  },
  pageHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTextWrapper: {
    flex: 1,
  },
  pageTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    color: '#8E929A',
    fontSize: 14,
    marginTop: 4,
  },
  musicIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    marginVertical: 20,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 79, 163, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyDesc: {
    color: '#8E929A',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    gap: 16,
  },
  loadingCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingInnerMask: {
    width: '100%',
    height: '100%',
    borderRadius: 19,
    backgroundColor: '#050507',
  },
  loadingMessage: {
    color: '#FF4FA3',
    fontSize: 14,
    fontWeight: '600',
  },
});
