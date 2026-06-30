import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GlobalWorkspaceLayout } from '@/components/mobile/GlobalWorkspaceLayout';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <GlobalWorkspaceLayout />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
