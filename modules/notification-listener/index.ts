import { requireNativeModule } from 'expo-modules-core';

const NativeModule = requireNativeModule('NotificationListenerModule');

export type WalletNotification = {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  amount: number;
  currency: string;
};

export async function hasNotificationPermission(): Promise<boolean> {
  return NativeModule.hasPermission();
}

export async function openNotificationPermissionSettings(): Promise<void> {
  return NativeModule.openPermissionSettings();
}

export async function getPendingWalletNotifications(): Promise<WalletNotification[]> {
  return NativeModule.getPendingNotifications();
}

export async function clearPendingWalletNotifications(): Promise<void> {
  return NativeModule.clearPendingNotifications();
}
