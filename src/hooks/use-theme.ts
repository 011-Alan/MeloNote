/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useSettings } from '@/context/SettingsContext';

export function useTheme() {
  const { theme } = useSettings();

  return Colors[theme];
}
