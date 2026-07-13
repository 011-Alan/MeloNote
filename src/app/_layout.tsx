import React, { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { GlobalWorkspaceLayout } from '@/components/mobile/GlobalWorkspaceLayout';
import { SettingsProvider, useSettings } from '@/context/SettingsContext';
import { ConversionProvider } from '@/context/ConversionContext';
import { OnboardingProvider } from '@/context/OnboardingContext';

// Prevent auto hiding of splash screen on startup
SplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayoutContent() {
  const { theme, isLoaded } = useSettings();
  console.log('RootLayoutContent mounted, theme:', theme, 'isLoaded:', isLoaded);

  useEffect(() => {
    if (isLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLoaded]);

  if (!isLoaded) {
    return null; // Keep native splash screen visible while settings load
  }

  return (
    <ThemeProvider value={theme === 'dark' ? DarkTheme : DefaultTheme}>
      <GlobalWorkspaceLayout />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  console.log('RootLayout mounted');

  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <ConversionProvider>
          <OnboardingProvider>
            <RootLayoutContent />
          </OnboardingProvider>
        </ConversionProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
