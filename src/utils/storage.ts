import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export async function saveLatestConversion(type: 'transcription' | 'scan', data: any) {
  try {
    const jsonStr = JSON.stringify(data);
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(`melonote_latest_${type}`, jsonStr);
    } else {
      const fileUri = `${FileSystem.documentDirectory}melonote_latest_${type}.json`;
      await FileSystem.writeAsStringAsync(fileUri, jsonStr);
    }
  } catch (e) {
    console.warn(`Failed to save latest ${type}:`, e);
  }
}

export async function loadLatestConversion(type: 'transcription' | 'scan'): Promise<any | null> {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(`melonote_latest_${type}`);
      return stored ? JSON.parse(stored) : null;
    } else {
      const fileUri = `${FileSystem.documentDirectory}melonote_latest_${type}.json`;
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (fileInfo.exists) {
        const content = await FileSystem.readAsStringAsync(fileUri);
        return JSON.parse(content);
      }
    }
  } catch (e) {
    console.warn(`Failed to load latest ${type}:`, e);
  }
  return null;
}

export async function clearLatestConversion(type: 'transcription' | 'scan') {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(`melonote_latest_${type}`);
    } else {
      const fileUri = `${FileSystem.documentDirectory}melonote_latest_${type}.json`;
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      }
    }
  } catch (e) {
    console.warn(`Failed to clear latest ${type}:`, e);
  }
}
