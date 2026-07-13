import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, useWindowDimensions, Platform, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, usePathname, Slot } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useSharedValue as useSharedValue2, // dummy placeholder if needed, let's keep original imports
  interpolate,
  withSpring,
  withSequence,
  withDelay,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

// Import components
import { MeloNoteLogoIntro } from './MeloNoteLogoIntro';
import { SidebarNav } from './SidebarNav';
import { MobileMenuButton } from './MobileMenuButton';
import { OnboardingScreen } from './OnboardingScreen';
import { useSettings } from '@/context/SettingsContext';
import { GlassCard } from '../ui/DesignSystem';
import { Ionicons } from '@expo/vector-icons';
import { requestNotificationPermissions, isExpoGo } from '@/utils/notifications';
import { useOnboarding } from '@/context/OnboardingContext';
import { NameCollectionModal } from '../onboarding/NameCollectionModal';
import { WalkthroughPromptModal } from '../onboarding/WalkthroughPromptModal';
import { WalkthroughOverlay } from '../onboarding/WalkthroughOverlay';

export function GlobalWorkspaceLayout() {
  console.log('GlobalWorkspaceLayout mounted');
  const router = useRouter();
  const pathname = usePathname();
  const { width, height } = useWindowDimensions();

  // States
  const [introActive, setIntroActive] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);
  
  const [showPrompt, setShowPrompt] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);

  const {
    userName,
    onboardingCompleted,
    isLoaded: isOnboardingLoaded,
    saveName,
    completeOnboarding,
    completeWalkthrough,
  } = useOnboarding();

  // Reanimated shared values
  const drawerProgress = useSharedValue(0);
  const toastOpacity = useSharedValue(0);

  const { theme } = useSettings();

  const layoutTheme = {
    bgSafe: theme === 'dark' ? '#050507' : '#FFFFFF',
    bgApp: theme === 'dark' ? '#000000' : '#F9F9FA',
    bgMain: theme === 'dark' ? '#050507' : '#FFFFFF',
    bgHeader: theme === 'dark' ? '#0F0F12' : '#F0F0F3',
    borderHeader: theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)',
    textHeader: theme === 'dark' ? '#FFFFFF' : '#121212',
  };

  useEffect(() => {
    const handleToast = (e: any) => {
      const { title, body } = e.detail;
      setToast({ title, body });
      toastOpacity.value = 0;
      toastOpacity.value = withSequence(
        withTiming(1, { duration: 350 }),
        withDelay(3000, withTiming(0, { duration: 350 }, (finished) => {
          if (finished) {
            runOnJS(setToast)(null);
          }
        }))
      );
    };

    if (Platform.OS === 'web') {
      window.addEventListener('melonote_toast', handleToast);
      return () => window.removeEventListener('melonote_toast', handleToast);
    }
  }, []);

  // Request notification permissions at startup
  useEffect(() => {
    requestNotificationPermissions();
  }, []);

  // Native notification tap handler
  useEffect(() => {
    if (Platform.OS !== 'web' && !isExpoGo && typeof require !== 'undefined') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Notifications = require('expo-notifications');
        const subscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
          const { title, data } = response.notification.request.content;
          console.log('[NOTIFICATION TAP] Native notification tapped:', title, data);
          if (data?.projectId) {
            router.push({ pathname: '/projects', params: { openProjectId: data.projectId } });
          } else if (title?.includes('Audio') || title?.includes('Transcription')) {
            router.push('/record');
          } else if (title?.includes('Scan') || title?.includes('Digitization') || title?.includes('Sheet')) {
            router.push('/scan');
          }
        });
        return () => {
          subscription.remove();
        };
      } catch (err) {
        console.warn('Failed to bind notifications listener:', err);
      }
    }
  }, []);

  const toastAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: toastOpacity.value,
      transform: [
        { translateY: interpolate(toastOpacity.value, [0, 1], [-20, 0]) },
      ],
    };
  });

  useEffect(() => {
    drawerProgress.value = withSpring(isDrawerOpen ? 1 : 0, {
      damping: 18,
      stiffness: 100,
    });
  }, [isDrawerOpen]);

  useEffect(() => {
    // Trigger walkthrough prompt 1 second after name is saved and home loads
    if (!introActive && userName && !onboardingCompleted && isOnboardingLoaded) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [introActive, userName, onboardingCompleted, isOnboardingLoaded]);

  // Determine active tab name from pathname
  const activeTab = useMemo(() => {
    switch (pathname) {
      case '/':
        return 'Home';
      case '/create':
        return 'Compose';
      case '/record':
        return 'Record';
      case '/scan':
        return 'Scan Sheet';
      case '/projects':
        return 'Projects';
      case '/basics':
        return 'Music Basics';
      case '/settings':
        return 'Settings';
      default:
        return 'Home';
    }
  }, [pathname]);

  // Determine page title automatically
  const pageTitle = useMemo(() => {
    switch (pathname) {
      case '/':
        return '🏠 Home';
      case '/create':
        return '✍️ Compose';
      case '/record':
        return '🎤 Record';
      case '/scan':
        return '📄 Scan Sheet';
      case '/projects':
        return '📂 Projects';
      case '/basics':
        return '🎼 Music Basics';
      case '/settings':
        return '⚙️ Settings';
      default:
        return 'MeloNote';
    }
  }, [pathname]);

  const showMockupFrame = Platform.OS === 'web' && width >= 600;
  const activationZoneWidth = showMockupFrame ? 375 * 0.20 : width * 0.20;

  const handleNavigate = (route: string, tabName: string) => {
    if (route === '/') {
      router.replace('/');
    } else {
      router.push(route as any);
    }
  };

  // Reanimated style for the main dashboard screen (perspective scale down + shift right)
  const mainScreenAnimatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(drawerProgress.value, [0, 1], [0, 250]);
    const scale = interpolate(drawerProgress.value, [0, 1], [1, 0.92]);
    const borderRadius = interpolate(drawerProgress.value, [0, 1], [0, 24]);

    return {
      transform: [{ translateX }, { scale }],
      borderRadius,
      overflow: borderRadius > 0 ? 'hidden' : 'visible',
    };
  });

  // Reanimated style for the sliding sidebar drawer
  const sidebarAnimatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(drawerProgress.value, [0, 1], [-280, 0]);
    return {
      transform: [{ translateX }],
    };
  });

  // Reanimated style for the background dimming overlay
  const overlayAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(drawerProgress.value, [0, 1], [0, 0.6]);
    return {
      opacity,
      pointerEvents: isDrawerOpen ? 'auto' : 'none',
    };
  });

  // Gestures


  const renderHomeContent = () => {
    return (
      <View style={[styles.appContainer, { backgroundColor: layoutTheme.bgApp }]}>
        <Animated.View style={[styles.mainScreenContainer, { backgroundColor: layoutTheme.bgMain }, mainScreenAnimatedStyle]}>
          <View style={[styles.customHeaderBar, { backgroundColor: layoutTheme.bgHeader, borderColor: layoutTheme.borderHeader }]}>
            <MobileMenuButton isOpen={isDrawerOpen} onPress={() => setIsDrawerOpen(!isDrawerOpen)} />
            <Text style={[styles.headerTitle, { color: layoutTheme.textHeader }]}>{pageTitle}</Text>
            <View style={{ width: 44 }} />
          </View>
          <View style={styles.slotContainer}>
            <Slot />
          </View>
          {isDrawerOpen && (
            <Animated.View style={[styles.dimOverlay, overlayAnimatedStyle]}>
              <Pressable style={styles.overlayPressable} onPress={() => setIsDrawerOpen(false)} />
            </Animated.View>
          )}
        </Animated.View>

        {/* Sliding Sidebar Navigation Drawer */}
        <Animated.View style={[styles.drawerContainer, sidebarAnimatedStyle]}>
          <SidebarNav
            activeTab={activeTab}
            onNavigate={handleNavigate}
            onClose={() => setIsDrawerOpen(false)}
          />
        </Animated.View>

        {/* In-app Toast Notification Overlay */}
        {toast && (
          <Animated.View style={[styles.toastContainer, toastAnimatedStyle]}>
            <Pressable
              onPress={() => {
                if (toast.title?.includes('Audio') || toast.title?.includes('Transcription')) {
                  router.push('/record');
                } else if (toast.title?.includes('Scan') || toast.title?.includes('Digitization')) {
                  router.push('/scan');
                }
                setToast(null);
              }}
            >
              <GlassCard style={styles.toastCard}>
                <View style={styles.toastContent}>
                  <Ionicons name="notifications" size={20} color="#FF4FA3" />
                  <View style={styles.toastTextWrapper}>
                    <Text style={[styles.toastTitle, { color: layoutTheme.textHeader }]}>{toast.title}</Text>
                    <Text style={styles.toastBody}>{toast.body}</Text>
                  </View>
                </View>
              </GlassCard>
            </Pressable>
          </Animated.View>
        )}

        {/* Onboarding Overlays */}
        {showPrompt && (
          <WalkthroughPromptModal
            visible={showPrompt}
            userName={userName}
            onStart={() => {
              setShowPrompt(false);
              setShowWalkthrough(true);
            }}
            onSkip={() => {
              setShowPrompt(false);
              completeOnboarding();
            }}
          />
        )}
        {showWalkthrough && (
          <WalkthroughOverlay
            onComplete={() => {
              setShowWalkthrough(false);
              completeWalkthrough();
            }}
          />
        )}
      </View>
    );
  };

  if (introActive) {
    return <MeloNoteLogoIntro onComplete={() => setIntroActive(false)} />;
  }

  if (isOnboardingLoaded && !userName) {
    return (
      <View style={{ flex: 1, backgroundColor: layoutTheme.bgApp }}>
        <NameCollectionModal visible={true} onContinue={saveName} />
      </View>
    );
  }

  // Render responsive mockup phone container for desktop web
  if (showMockupFrame) {
    return (
      <View style={styles.webDesktopBackground}>
        <LinearGradient
          colors={['#1F1F24', '#0A0A0C']}
          style={StyleSheet.absoluteFill}
        />
        
        {/* Animated background blobs */}
        <View style={styles.floatingCircle1} />
        <View style={styles.floatingCircle2} />

        {/* Mockup phone frame */}
        <View style={styles.phoneDeviceShell}>
          {/* Status Bar */}
          <View style={styles.deviceStatusBar}>
            <Text style={styles.statusBarTime}>9:41</Text>
            <View style={styles.statusBarIcons}>
              <Text style={styles.statusBarIconText}>📶</Text>
              <Text style={styles.statusBarIconText}>🔋</Text>
            </View>
          </View>
          
          {/* Phone Screen Viewport */}
          <View style={styles.phoneScreen}>
            {renderHomeContent()}
          </View>
        </View>
        
        {/* Desktop Sidebar Prompt info */}
        <View style={styles.desktopInfoPanel}>
          <Text style={styles.brandTitle}>MeloNote AI</Text>
          <Text style={styles.brandSubtitle}>Intelligent Music Workspace</Text>
          
          <View style={styles.badgeRow}>
            <View style={styles.techBadge}><Text style={styles.techBadgeText}>React Native</Text></View>
            <View style={styles.techBadge}><Text style={styles.techBadgeText}>Slot Router</Text></View>
            <View style={styles.techBadge}><Text style={styles.techBadgeText}>Global Layout</Text></View>
          </View>

          <Text style={styles.desktopDesc}>
            MeloNote acts as a music workspace rather than a simple menu tool. Tap the custom five-line staff menu button or drag from the left edge of the screen to reveal the glassmorphic sidebar drawer and see the main interface scale down.
          </Text>
        </View>
      </View>
    );
  }

  // Full Screen Native Mobile View
  return (
    <SafeAreaView style={[styles.safeAreaContainer, { backgroundColor: layoutTheme.bgSafe }]}>
      {renderHomeContent()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeAreaContainer: {
    flex: 1,
    backgroundColor: '#050507',
  },
  appContainer: {
    flex: 1,
    backgroundColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
  },
  mainScreenContainer: {
    flex: 1,
    backgroundColor: '#050507',
    shadowColor: '#000000',
    shadowOffset: { width: -10, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    zIndex: 10,
  },
  customHeaderBar: {
    height: 60,
    backgroundColor: '#0F0F12',
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontFamily: Platform.OS === 'web' ? 'var(--font-rounded)' : 'System',
  },
  slotContainer: {
    flex: 1,
  },
  dimOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
    zIndex: 800,
  },
  overlayPressable: {
    flex: 1,
  },
  drawerContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 280,
    zIndex: 900,
  },

  // Web desktop container styling
  webDesktopBackground: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#050507',
    gap: 60,
    overflow: 'hidden',
  },
  phoneDeviceShell: {
    width: 395,
    height: 812,
    borderRadius: 48,
    backgroundColor: '#0F0F12',
    borderWidth: 10,
    borderColor: '#1D1D24',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 28 },
    shadowOpacity: 0.6,
    shadowRadius: 36,
    overflow: 'hidden',
    position: 'relative',
  },
  deviceStatusBar: {
    height: 38,
    backgroundColor: '#0F0F12',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    zIndex: 999,
  },
  statusBarTime: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  statusBarIcons: {
    flexDirection: 'row',
    gap: 6,
  },
  statusBarIconText: {
    color: '#B0B4BA',
    fontSize: 12,
  },
  phoneScreen: {
    flex: 1,
    backgroundColor: '#050507',
  },
  // Desktop info panel
  desktopInfoPanel: {
    width: 320,
    justifyContent: 'center',
  },
  brandTitle: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1,
  },
  brandSubtitle: {
    color: '#FF4FA3',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 20,
  },
  techBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  techBadgeText: {
    color: '#B0B4BA',
    fontSize: 11,
    fontWeight: 'bold',
  },
  desktopDesc: {
    color: '#8E929A',
    fontSize: 14,
    lineHeight: 22,
  },
  floatingCircle1: {
    position: 'absolute',
    left: '10%',
    top: '20%',
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: 'rgba(255, 138, 0, 0.04)',
    filter: Platform.OS === 'web' ? 'blur(100px)' : undefined,
  },
  floatingCircle2: {
    position: 'absolute',
    right: '15%',
    bottom: '15%',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(123, 97, 255, 0.04)',
    filter: Platform.OS === 'web' ? 'blur(90px)' : undefined,
  },
  toastContainer: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    zIndex: 9999,
    alignItems: 'center',
  },
  toastCard: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    width: '100%',
    maxWidth: 350,
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toastTextWrapper: {
    flex: 1,
    gap: 2,
  },
  toastTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  toastBody: {
    color: '#8E929A',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
});
