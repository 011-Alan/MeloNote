/**
 * OnboardingContext.tsx
 *
 * Central context for all first-time user onboarding state.
 * Persists to localStorage (web) or AsyncStorage-style file (native).
 * Designed to be reusable and extensible for future Settings integration.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

// ─── Storage Keys ────────────────────────────────────────────────────────────
const KEY_USER_NAME           = 'melonote_user_name';
const KEY_ONBOARDING_DONE     = 'melonote_onboarding_completed';
const KEY_WALKTHROUGH_DONE    = 'melonote_walkthrough_completed';
const NATIVE_FILE = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}melonote_onboarding.json`
  : null;

// ─── Context Shape ────────────────────────────────────────────────────────────
export interface OnboardingState {
  /** User's first name, empty string if not yet set */
  userName: string;
  /** Whether the name-collection + prompt flow is done */
  onboardingCompleted: boolean;
  /** Whether the walkthrough tour itself is done or skipped */
  walkthroughCompleted: boolean;
  /** Context is ready to read (loaded from storage) */
  isLoaded: boolean;
  /** Save user name and mark name step complete */
  saveName: (name: string) => void;
  /** Mark the entire onboarding flow as complete (no tour) */
  completeOnboarding: () => void;
  /** Mark the walkthrough tour as complete */
  completeWalkthrough: () => void;
  /** Reset all onboarding data (for Settings future use) */
  resetOnboarding: () => void;
}

const OnboardingContext = createContext<OnboardingState | undefined>(undefined);

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function readNativeData(): Promise<Record<string, string>> {
  if (!NATIVE_FILE) return {};
  try {
    const info = await FileSystem.getInfoAsync(NATIVE_FILE);
    if (info.exists) {
      const raw = await FileSystem.readAsStringAsync(NATIVE_FILE);
      return JSON.parse(raw);
    }
  } catch (_) { /* ignore */ }
  return {};
}

async function writeNativeData(data: Record<string, string>): Promise<void> {
  if (!NATIVE_FILE) return;
  try {
    await FileSystem.writeAsStringAsync(NATIVE_FILE, JSON.stringify(data));
  } catch (_) { /* ignore */ }
}

function webGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch (_) { /* ignore */ }
  return null;
}

function webSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch (_) { /* ignore */ }
}

function webRemove(key: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch (_) { /* ignore */ }
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [userName, setUserNameState] = useState('');
  const [onboardingCompleted, setOnboardingCompletedState] = useState(false);
  const [walkthroughCompleted, setWalkthroughCompletedState] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from storage on mount
  useEffect(() => {
    async function load() {
      if (Platform.OS === 'web') {
        const name = webGet(KEY_USER_NAME) || '';
        const oDone = webGet(KEY_ONBOARDING_DONE) === 'true';
        const wDone = webGet(KEY_WALKTHROUGH_DONE) === 'true';
        setUserNameState(name);
        setOnboardingCompletedState(oDone);
        setWalkthroughCompletedState(wDone);
      } else {
        const data = await readNativeData();
        setUserNameState(data[KEY_USER_NAME] || '');
        setOnboardingCompletedState(data[KEY_ONBOARDING_DONE] === 'true');
        setWalkthroughCompletedState(data[KEY_WALKTHROUGH_DONE] === 'true');
      }
      setIsLoaded(true);
    }
    load();
  }, []);

  const saveName = useCallback((name: string) => {
    const trimmed = name.trim();
    setUserNameState(trimmed);
    if (Platform.OS === 'web') {
      webSet(KEY_USER_NAME, trimmed);
    } else {
      readNativeData().then((data) => {
        writeNativeData({ ...data, [KEY_USER_NAME]: trimmed });
      });
    }
  }, []);

  const completeOnboarding = useCallback(() => {
    setOnboardingCompletedState(true);
    if (Platform.OS === 'web') {
      webSet(KEY_ONBOARDING_DONE, 'true');
    } else {
      readNativeData().then((data) => {
        writeNativeData({ ...data, [KEY_ONBOARDING_DONE]: 'true' });
      });
    }
  }, []);

  const completeWalkthrough = useCallback(() => {
    setWalkthroughCompletedState(true);
    setOnboardingCompletedState(true);
    if (Platform.OS === 'web') {
      webSet(KEY_WALKTHROUGH_DONE, 'true');
      webSet(KEY_ONBOARDING_DONE, 'true');
    } else {
      readNativeData().then((data) => {
        writeNativeData({
          ...data,
          [KEY_WALKTHROUGH_DONE]: 'true',
          [KEY_ONBOARDING_DONE]: 'true',
        });
      });
    }
  }, []);

  const resetOnboarding = useCallback(() => {
    setUserNameState('');
    setOnboardingCompletedState(false);
    setWalkthroughCompletedState(false);
    if (Platform.OS === 'web') {
      webRemove(KEY_USER_NAME);
      webRemove(KEY_ONBOARDING_DONE);
      webRemove(KEY_WALKTHROUGH_DONE);
    } else {
      if (NATIVE_FILE) {
        FileSystem.deleteAsync(NATIVE_FILE, { idempotent: true }).catch(() => {});
      }
    }
  }, []);

  return (
    <OnboardingContext.Provider
      value={{
        userName,
        onboardingCompleted,
        walkthroughCompleted,
        isLoaded,
        saveName,
        completeOnboarding,
        completeWalkthrough,
        resetOnboarding,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useOnboarding(): OnboardingState {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
