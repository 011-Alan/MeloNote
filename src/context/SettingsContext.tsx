import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export type ThemeType = 'light' | 'dark';

export interface SettingsState {
  theme: ThemeType;
  notificationsEnabled: boolean;
  inAppVolumeEnabled: boolean;
  inAppVolume: number; // 0.0 to 1.0
  isLoaded: boolean;
  setTheme: (theme: ThemeType) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setInAppVolumeEnabled: (enabled: boolean) => void;
  setInAppVolume: (volume: number) => void;
}

const SettingsContext = createContext<SettingsState | undefined>(undefined);

const SETTINGS_FILE = `${FileSystem.documentDirectory}melonote_settings.json`;

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);

  const [theme, setThemeState] = useState<ThemeType>(() => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const storedTheme = localStorage.getItem('melonote_theme');
        if (storedTheme === 'light' || storedTheme === 'dark') {
          return storedTheme;
        }
      }
    } catch (e) {
      console.warn('Error reading theme from storage:', e);
    }
    return 'dark';
  });

  const [notificationsEnabled, setNotificationsEnabledState] = useState<boolean>(() => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const storedNotifications = localStorage.getItem('melonote_notifications_enabled');
        if (storedNotifications !== null) {
          return storedNotifications !== 'false';
        }
      }
    } catch (e) {
      console.warn('Error reading notifications enabled from storage:', e);
    }
    return true;
  });

  const [inAppVolumeEnabled, setInAppVolumeEnabledState] = useState<boolean>(() => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const storedVolumeEnabled = localStorage.getItem('melonote_in_app_volume_enabled');
        if (storedVolumeEnabled !== null) {
          return storedVolumeEnabled !== 'false';
        }
      }
    } catch (e) {
      console.warn('Error reading volume enabled from storage:', e);
    }
    return true;
  });

  const [inAppVolume, setInAppVolumeState] = useState<number>(() => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const storedVolume = localStorage.getItem('melonote_in_app_volume');
        if (storedVolume !== null) {
          const parsed = parseFloat(storedVolume);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
            return parsed;
          }
        }
      }
    } catch (e) {
      console.warn('Error reading in-app volume level from storage:', e);
    }
    return 1.0;
  });

  // Load settings on startup on Native
  useEffect(() => {
    async function loadSettings() {
      if (Platform.OS === 'web') {
        setIsLoaded(true);
        return;
      }
      try {
        const fileInfo = await FileSystem.getInfoAsync(SETTINGS_FILE);
        if (fileInfo.exists) {
          const content = await FileSystem.readAsStringAsync(SETTINGS_FILE);
          const data = JSON.parse(content);
          if (data.theme === 'light' || data.theme === 'dark') {
            setThemeState(data.theme);
          }
          if (data.notificationsEnabled !== undefined) {
            setNotificationsEnabledState(!!data.notificationsEnabled);
          }
          if (data.inAppVolumeEnabled !== undefined) {
            setInAppVolumeEnabledState(!!data.inAppVolumeEnabled);
          }
          if (data.inAppVolume !== undefined) {
            const parsed = parseFloat(data.inAppVolume);
            if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
              setInAppVolumeState(parsed);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to load settings from file:', e);
      } finally {
        setIsLoaded(true);
      }
    }
    loadSettings();
  }, []);

  const saveNativeSettings = async (
    t: ThemeType,
    n: boolean,
    vEnabled: boolean,
    v: number
  ) => {
    if (Platform.OS === 'web') return;
    try {
      const data = {
        theme: t,
        notificationsEnabled: n,
        inAppVolumeEnabled: vEnabled,
        inAppVolume: v,
      };
      await FileSystem.writeAsStringAsync(SETTINGS_FILE, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  };

  const setTheme = (newTheme: ThemeType) => {
    setThemeState(newTheme);
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem('melonote_theme', newTheme);
      } else {
        saveNativeSettings(newTheme, notificationsEnabled, inAppVolumeEnabled, inAppVolume);
      }
    } catch (e) {
      console.warn('Error saving theme:', e);
    }
  };

  const setNotificationsEnabled = (enabled: boolean) => {
    setNotificationsEnabledState(enabled);
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem('melonote_notifications_enabled', String(enabled));
      } else {
        saveNativeSettings(theme, enabled, inAppVolumeEnabled, inAppVolume);
      }
    } catch (e) {
      console.warn('Error saving notifications settings:', e);
    }
  };

  const setInAppVolumeEnabled = (enabled: boolean) => {
    setInAppVolumeEnabledState(enabled);
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem('melonote_in_app_volume_enabled', String(enabled));
      } else {
        saveNativeSettings(theme, notificationsEnabled, enabled, inAppVolume);
      }
    } catch (e) {
      console.warn('Error saving in-app volume settings:', e);
    }
  };

  const setInAppVolume = (volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    setInAppVolumeState(clamped);
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem('melonote_in_app_volume', String(clamped));
      } else {
        saveNativeSettings(theme, notificationsEnabled, inAppVolumeEnabled, clamped);
      }
    } catch (e) {
      console.warn('Error saving in-app volume level:', e);
    }
  };

  return (
    <SettingsContext.Provider
      value={{
        theme,
        notificationsEnabled,
        inAppVolumeEnabled,
        inAppVolume,
        isLoaded,
        setTheme,
        setNotificationsEnabled,
        setInAppVolumeEnabled,
        setInAppVolume,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
