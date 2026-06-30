import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, useWindowDimensions, Platform, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, usePathname, Slot } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from 'react-native-reanimated';

// Import components
import { MeloNoteLogoIntro } from './MeloNoteLogoIntro';
import { SidebarNav } from './SidebarNav';
import { MobileMenuButton } from './MobileMenuButton';

export function GlobalWorkspaceLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { width, height } = useWindowDimensions();

  // States
  const [introActive, setIntroActive] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Drawer animation progress shared values
  const drawerProgress = useSharedValue(0);

  useEffect(() => {
    drawerProgress.value = withSpring(isDrawerOpen ? 1 : 0, {
      damping: 18,
      stiffness: 100,
    });
  }, [isDrawerOpen]);

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
      <View style={styles.appContainer}>
        {/* Main Content View with scaling & shifting transformations */}
        <Animated.View style={[styles.mainScreenContainer, mainScreenAnimatedStyle]}>
          
          {/* Custom Header Bar containing the Animated staff menu button */}
          <View style={styles.customHeaderBar}>
            <MobileMenuButton isOpen={isDrawerOpen} onPress={() => setIsDrawerOpen(!isDrawerOpen)} />
            <Text style={styles.headerTitle}>{pageTitle}</Text>
            <View style={{ width: 44 }} /> {/* Spacer */}
          </View>

          {/* Active route slot screen content rendering below the global header */}
          <View style={styles.slotContainer}>
            <Slot />
          </View>

          {/* Dimming overlay when drawer is open - handles tapping to close */}
          {isDrawerOpen ? (
            <Animated.View style={[styles.dimOverlay, overlayAnimatedStyle]}>
              <Pressable style={styles.overlayPressable} onPress={() => setIsDrawerOpen(false)} />
            </Animated.View>
          ) : null}
        </Animated.View>

        {/* Sliding Sidebar Navigation Drawer */}
        <Animated.View style={[styles.drawerContainer, sidebarAnimatedStyle]}>
          <SidebarNav
            activeTab={activeTab}
            onNavigate={handleNavigate}
            onClose={() => setIsDrawerOpen(false)}
          />
        </Animated.View>
      </View>
    );
  };

  if (introActive) {
    return <MeloNoteLogoIntro onComplete={() => setIntroActive(false)} />;
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
    <SafeAreaView style={styles.safeAreaContainer}>
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
});
