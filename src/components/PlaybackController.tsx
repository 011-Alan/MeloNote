import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Platform, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '@/context/SettingsContext';

interface PlaybackControllerProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onRestart: () => void;
  onSeek: (time: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export default function PlaybackController({
  currentTime,
  duration,
  isPlaying,
  onPlayPause,
  onRestart,
  onSeek,
  onDragStart,
  onDragEnd,
}: PlaybackControllerProps) {
  const { theme } = useSettings();
  const isDark = theme === 'dark';
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const [progressBarWidth, setProgressBarWidth] = useState(0);

  // Equalizer animation heights
  const anim1 = useRef(new Animated.Value(6)).current;
  const anim2 = useRef(new Animated.Value(10)).current;
  const anim3 = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    let animations: Animated.CompositeAnimation[] = [];

    if (isPlaying) {
      const createLoop = (value: Animated.Value, min: number, max: number, duration: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(value, {
              toValue: max,
              duration: duration,
              useNativeDriver: false,
            }),
            Animated.timing(value, {
              toValue: min,
              duration: duration,
              useNativeDriver: false,
            }),
          ])
        );
      };

      const a1 = createLoop(anim1, 6, 20, 300);
      const a2 = createLoop(anim2, 6, 26, 250);
      const a3 = createLoop(anim3, 6, 22, 350);

      animations = [a1, a2, a3];
      animations.forEach(a => a.start());
    } else {
      Animated.timing(anim1, { toValue: 8, duration: 200, useNativeDriver: false }).start();
      Animated.timing(anim2, { toValue: 8, duration: 200, useNativeDriver: false }).start();
      Animated.timing(anim3, { toValue: 8, duration: 200, useNativeDriver: false }).start();
    }

    return () => {
      animations.forEach(a => a.stop());
    };
  }, [isPlaying]);

  const formatTime = (sec: number) => {
    if (isNaN(sec) || sec < 0) return '0:00';
    const roundedSec = Math.round(sec);
    const minutes = Math.floor(roundedSec / 60);
    const seconds = roundedSec % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const handleTouch = (e: any) => {
    if (duration <= 0 || progressBarWidth <= 0) return;
    const touchX = e.nativeEvent.locationX ?? e.nativeEvent.offsetX ?? 0;
    const ratio = Math.max(0, Math.min(1, touchX / progressBarWidth));
    const targetTime = ratio * duration;
    setDragTime(targetTime);
  };

  const activeProgress = isDragging ? dragTime : currentTime;
  const progressPercent = duration > 0 ? (activeProgress / duration) * 100 : 0;
  const displayProgress = Math.min(100, Math.max(0, progressPercent));

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#121214' : '#FFFFFF', borderTopColor: isDark ? '#1c1c1e' : 'rgba(0, 0, 0, 0.08)' }]}>
      {/* Clickable and Draggable Progress Bar with Pointer Ball */}
      <View style={styles.sliderWrapper}>
        <View
          onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}
          onTouchStart={(e) => {
            setIsDragging(true);
            if (onDragStart) onDragStart();
            handleTouch(e);
          }}
          onTouchMove={(e) => {
            handleTouch(e);
          }}
          onTouchEnd={() => {
            setIsDragging(false);
            if (onDragEnd) onDragEnd();
            onSeek(dragTime);
          }}
          style={styles.touchArea}
        >
          <View style={[styles.trackBackground, { backgroundColor: isDark ? '#2c2c2e' : 'rgba(0, 0, 0, 0.08)' }]}>
            <View 
              style={[
                styles.trackFill, 
                { width: `${displayProgress}%` }
              ]} 
            />
            {/* Moving Ball Knob */}
            <View
              style={[
                styles.knob,
                { left: `${displayProgress}%` }
              ]}
            />
          </View>
        </View>
      </View>

      {/* Buttons & Info Row */}
      <View style={styles.controlsRow}>
        <View style={styles.timeLeftContainer}>
          <Text style={[styles.timeText, { color: isDark ? '#ffffff' : '#121212' }]}>
            {formatTime(activeProgress)} / {formatTime(duration)}
          </Text>
        </View>

        <View style={styles.buttonsContainer}>
          <Pressable
            disabled={currentTime === 0}
            onPress={onRestart}
            style={({ pressed }) => [
              styles.restartBtn,
              { backgroundColor: isDark ? '#1c1c1e' : 'rgba(0, 0, 0, 0.05)' },
              currentTime === 0 && { opacity: 0.4 },
              pressed && currentTime > 0 && { transform: [{ scale: 0.9 }] }
            ]}
          >
            <Ionicons name="play-skip-back" size={18} color={isDark ? 'white' : '#121212'} />
          </Pressable>

          <Pressable
            onPress={onPlayPause}
            style={({ pressed }) => [
              styles.playPauseBtn,
              pressed && { opacity: 0.8, transform: [{ scale: 0.92 }] }
            ]}
          >
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={24}
              color="white"
            />
          </Pressable>
        </View>

        <View style={styles.rightSideContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 26, paddingRight: 4 }}>
            <Animated.View style={{ width: 4, backgroundColor: '#FF8A00', borderRadius: 4, height: anim1 }} />
            <Animated.View style={{ width: 4, backgroundColor: '#FF4FA3', borderRadius: 4, height: anim2 }} />
            <Animated.View style={{ width: 4, backgroundColor: '#7B61FF', borderRadius: 4, height: anim3 }} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#121214',
    borderTopWidth: 1,
    borderTopColor: '#1c1c1e',
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  sliderWrapper: {
    width: '100%',
    height: 24,
    justifyContent: 'center',
  },
  touchArea: {
    width: '100%',
    height: 24,
    justifyContent: 'center',
  },
  trackBackground: {
    height: 6,
    backgroundColor: '#2c2c2e',
    borderRadius: 3,
    width: '100%',
    position: 'relative',
    pointerEvents: 'none',
  },
  trackFill: {
    height: 6,
    backgroundColor: '#ff9500',
    borderRadius: 3,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  knob: {
    position: 'absolute',
    top: -4,
    marginLeft: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: '#ff9500',
    elevation: 3,
  },
  controlsRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  timeLeftContainer: {
    flex: 0.6,
    minWidth: 90,
    alignItems: 'flex-start',
  },
  timeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  buttonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  restartBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1c1c1e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ff9500',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightSideContainer: {
    flex: 0.6,
    minWidth: 90,
    alignItems: "center",
  },
});
