import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable, Platform, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// Import design system components & settings context
import { GradientBackground, GlassCard } from '@/components/ui/DesignSystem';
import { useSettings } from '@/context/SettingsContext';

import { WalkthroughRegistry } from '@/components/onboarding/WalkthroughRegistry';

interface SwitchRowProps {
  icon: string;
  title: string;
  isEnabled: boolean;
  onToggle: () => void;
  innerRef?: (ref: any) => void;
}

function SwitchRow({ icon, title, isEnabled, onToggle, innerRef }: SwitchRowProps) {
  const { theme } = useSettings();
  const textColor = theme === 'dark' ? '#FFFFFF' : '#121212';
  const trackBg = isEnabled
    ? '#FF4FA3'
    : (theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)');
  const knobBg = '#FFFFFF';

  return (
    <Pressable ref={innerRef} style={styles.settingRow} onPress={onToggle}>
      <View style={styles.settingRowLeft}>
        <View style={styles.settingIconCircle}>
          <Ionicons name={icon as any} size={20} color="#FF4FA3" />
        </View>
        <Text style={[styles.settingTitle, { color: textColor }]}>{title}</Text>
      </View>
      <View style={styles.settingRowRight}>
        <View style={[styles.switchTrack, { backgroundColor: trackBg }]}>
          <View style={[
            styles.switchKnob,
            {
              backgroundColor: knobBg,
              left: isEnabled ? 22 : 2,
            }
          ]} />
        </View>
      </View>
    </Pressable>
  );
}

interface SliderRowProps {
  icon: string;
  title: string;
  value: number; // 0.0 to 1.0
  onValueChange: (val: number) => void;
  disabled: boolean;
  innerRef?: (ref: any) => void;
}

function SliderRow({ icon, title, value, onValueChange, disabled, innerRef }: SliderRowProps) {
  const { theme } = useSettings();
  const textColor = theme === 'dark' ? '#FFFFFF' : '#121212';
  const [sliderWidth, setSliderWidth] = useState(0);

  const handleTouch = (e: any) => {
    if (disabled || sliderWidth <= 0) return;
    const touchX = e.nativeEvent.locationX ?? e.nativeEvent.offsetX ?? 0;
    const ratio = Math.max(0, Math.min(1, touchX / sliderWidth));
    onValueChange(ratio);
  };

  const percentage = Math.round(value * 100);
  const displayProgress = value * 100;

  return (
    <View ref={innerRef} style={[styles.sliderRowContainer, disabled && { opacity: 0.35 }]}>
      <View style={styles.settingRowHeader}>
        <View style={styles.settingRowLeft}>
          <View style={styles.settingIconCircle}>
            <Ionicons name={icon as any} size={20} color="#FF4FA3" />
          </View>
          <Text style={[styles.settingTitle, { color: textColor }]}>{title}</Text>
        </View>
        <Text style={styles.settingValue}>{percentage}%</Text>
      </View>
      <View style={styles.sliderWrapper}>
        <View
          onLayout={(e) => setSliderWidth(e.nativeEvent.layout.width)}
          onTouchStart={handleTouch}
          onTouchMove={handleTouch}
          onTouchEnd={handleTouch}
          style={styles.sliderTouchArea}
        >
          <View 
            pointerEvents="none"
            style={[
              styles.sliderTrackBackground,
              { backgroundColor: theme === 'dark' ? '#2E3135' : '#E0E1E6' }
            ]}
          >
            <LinearGradient
              colors={['#FF8A00', '#FF4FA3']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[
                styles.sliderTrackFill,
                { width: `${displayProgress}%` }
              ]}
            />
            <View
              style={[
                styles.sliderKnob,
                { left: `${displayProgress}%` }
              ]}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

import { useOnboarding } from '@/context/OnboardingContext';

export default function SettingsScreen() {
  const { userName } = useOnboarding();
  const name = userName || 'Alan Jackson';
  
  const {
    theme,
    setTheme,
    notificationsEnabled,
    setNotificationsEnabled,
    inAppVolumeEnabled,
    setInAppVolumeEnabled,
    inAppVolume,
    setInAppVolume,
  } = useSettings();

  const avatarText = name.trim().charAt(0).toUpperCase() || 'U';

  const isDark = theme === 'dark';
  const groupTitleColor = isDark ? '#8E929A' : '#60646C';
  const nameColor = isDark ? '#FFFFFF' : '#121212';
  const indicatorBorder = isDark ? '#0F0F12' : '#FFFFFF';

  return (
    <GradientBackground>
      <ScrollView
        ref={(r) => WalkthroughRegistry.register('active-scrollview', r)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Profile Header Card */}
        <GlassCard style={styles.profileCard}>
          <View style={styles.profileAvatarCircle}>
            <Text style={styles.profileAvatarText}>{avatarText}</Text>
            <View style={[styles.onlineIndicator, { borderColor: indicatorBorder }]} />
          </View>
          <View style={styles.profileDetails}>
            <Text style={[styles.profileName, { color: nameColor }]}>{name}</Text>
          </View>
        </GlassCard>

        {/* Preferences group */}
        <Text style={[styles.groupTitle, { color: groupTitleColor }]}>PREFERENCES</Text>
        <GlassCard style={styles.settingsGroupCard}>
          <SwitchRow
            innerRef={(r) => WalkthroughRegistry.register('settings-theme', r)}
            icon="moon-outline"
            title="Dark Theme Mode"
            isEnabled={isDark}
            onToggle={() => setTheme(isDark ? 'light' : 'dark')}
          />
          <View style={[styles.innerDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.06)' }]} />
          
          <SwitchRow
            icon="notifications-outline"
            title="Notifications"
            isEnabled={notificationsEnabled}
            onToggle={() => setNotificationsEnabled(!notificationsEnabled)}
          />
          <View style={[styles.innerDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.06)' }]} />

          <SwitchRow
            icon="volume-mute-outline"
            title="Enable In-App Volume"
            isEnabled={inAppVolumeEnabled}
            onToggle={() => setInAppVolumeEnabled(!inAppVolumeEnabled)}
          />
        </GlassCard>

        {/* Playback Volume Slider group */}
        <Text style={[styles.groupTitle, { color: groupTitleColor }]}>PLAYBACK VOLUME</Text>
        <GlassCard style={styles.settingsGroupCard}>
          <SliderRow
            innerRef={(r) => WalkthroughRegistry.register('settings-volume', r)}
            icon="volume-high-outline"
            title="Volume Level"
            value={inAppVolume}
            onValueChange={setInAppVolume}
            disabled={!inAppVolumeEnabled}
          />
        </GlassCard>

        {/* App details bottom notice */}
        <View style={styles.appDetailsFooter}>
          <Ionicons name="sparkles" size={16} color="#FF8A00" />
          <Text style={styles.footerText}>AI-powered MeloNote</Text>
        </View>
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 80,
    gap: 16,
  } as ViewStyle,
  profileCard: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 24,
  } as ViewStyle,
  profileAvatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF4FA3',
    borderWidth: 2,
    borderColor: '#FF4FA3',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#FF4FA3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  } as ViewStyle,
  profileAvatarText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
  } as TextStyle,
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#00E676',
    borderWidth: 2,
  } as ViewStyle,
  profileDetails: {
    alignItems: 'center',
  } as ViewStyle,
  profileName: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  } as TextStyle,
  groupTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 10,
    marginLeft: 4,
  } as TextStyle,
  settingsGroupCard: {
    padding: 6,
  } as ViewStyle,
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
  } as ViewStyle,
  settingRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 12,
  } as ViewStyle,
  settingRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  } as ViewStyle,
  settingIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 79, 163, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  settingTitle: {
    fontSize: 15,
    fontWeight: '600',
  } as TextStyle,
  settingRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  } as ViewStyle,
  settingValue: {
    color: '#FF8A00',
    fontSize: 13,
    fontWeight: '700',
  } as TextStyle,
  innerDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    marginHorizontal: 12,
  } as ViewStyle,
  appDetailsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    opacity: 0.6,
  } as ViewStyle,
  footerText: {
    color: '#8E929A',
    fontSize: 12,
    fontWeight: '600',
  } as TextStyle,
  switchTrack: {
    width: 46,
    height: 26,
    borderRadius: 13,
    padding: 2,
    justifyContent: 'center',
    position: 'relative',
  } as ViewStyle,
  switchKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    position: 'absolute',
  } as ViewStyle,
  sliderRowContainer: {
    paddingVertical: 8,
    gap: 6,
  } as ViewStyle,
  sliderWrapper: {
    width: '100%',
    height: 28,
    paddingHorizontal: 12,
    justifyContent: 'center',
  } as ViewStyle,
  sliderTouchArea: {
    width: '100%',
    height: 28,
    justifyContent: 'center',
  } as ViewStyle,
  sliderTrackBackground: {
    height: 6,
    borderRadius: 3,
    width: '100%',
    position: 'relative',
  } as ViewStyle,
  sliderTrackFill: {
    height: 6,
    borderRadius: 3,
    position: 'absolute',
    left: 0,
    top: 0,
  } as ViewStyle,
  sliderKnob: {
    position: 'absolute',
    top: -5,
    marginLeft: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#FF4FA3',
    elevation: 3,
  } as ViewStyle,
});
