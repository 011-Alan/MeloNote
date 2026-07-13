import { Platform, Alert } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let Notifications: any = null;

if (Platform.OS !== 'web' && !isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require('expo-notifications');
    // Set up foreground notification handler
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (e) {
    console.warn('Failed to load expo-notifications:', e);
  }
}

// Helper to check if notifications are enabled in localStorage
export function areNotificationsEnabled(): boolean {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('melonote_notifications_enabled');
      return stored !== 'false'; // default to true
    }
  } catch (e) {
    console.warn('Storage check failed for notifications:', e);
  }
  return true; // default
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo) return false;
  if (Notifications) {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        const { status: askStatus } = await Notifications.requestPermissionsAsync();
        return askStatus === 'granted';
      }
      return true;
    } catch (e) {
      console.warn('Failed to request notification permissions:', e);
    }
  }
  return false;
}

export async function sendLocalNotification(title: string, body: string, data?: Record<string, any>) {
  if (!areNotificationsEnabled()) {
    console.log('[NOTIFICATION BYPASS] Notifications are disabled in settings.');
    return;
  }

  console.log('[NOTIFICATION SENDING]', title, body, data);

  if (Platform.OS === 'web') {
    // 1. Send native browser notification if permitted
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      } else if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          new Notification(title, { body });
        }
      }
    }
    
    // 2. Dispatch in-app toast event for instant glassmorphic overlay display
    if (typeof window !== 'undefined') {
      try {
        const event = new CustomEvent('melonote_toast', { detail: { title, body } });
        window.dispatchEvent(event);
      } catch (e) {
        console.warn('Failed to dispatch custom event:', e);
      }
    }
  } else {
    // Native mobile notifications using expo-notifications
    if (Notifications) {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        let finalStatus = status;
        if (status !== 'granted') {
          const { status: askStatus } = await Notifications.requestPermissionsAsync();
          finalStatus = askStatus;
        }
        if (finalStatus === 'granted') {
          await Notifications.scheduleNotificationAsync({
            content: {
              title,
              body,
              sound: true,
              data: data || {},
            },
            trigger: null, // send immediately
          });
          return;
        }
      } catch (err) {
        console.warn('Failed to send native notification:', err);
      }
    }
    if (isExpoGo) {
      Alert.alert(title, body);
    } else {
      console.log('[NOTIFICATION LOG]', title, body);
    }
  }
}

