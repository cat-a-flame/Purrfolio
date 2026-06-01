import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

const KEY_PIN = '@purrfolio/pin';
const KEY_PIN_ENABLED = '@purrfolio/pin_enabled';
const KEY_BIOMETRICS_ENABLED = '@purrfolio/biometrics_enabled';

export async function isPinEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY_PIN_ENABLED)) === 'true';
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(KEY_PIN);
  return stored === pin;
}

export async function savePin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_PIN, pin);
  await SecureStore.setItemAsync(KEY_PIN_ENABLED, 'true');
}

export async function disablePin(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_PIN);
  await SecureStore.setItemAsync(KEY_PIN_ENABLED, 'false');
  await SecureStore.setItemAsync(KEY_BIOMETRICS_ENABLED, 'false');
}

export async function isBiometricsEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY_BIOMETRICS_ENABLED)) === 'true';
}

export async function setBiometricsEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEY_BIOMETRICS_ENABLED, enabled ? 'true' : 'false');
}

export async function getBiometricsType(): Promise<'face' | 'fingerprint' | null> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  if (!hasHardware || !isEnrolled) return null;
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
  return 'fingerprint';
}

export async function authenticateWithBiometrics(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock Purrfolio',
    disableDeviceFallback: true,
    cancelLabel: 'Use PIN',
  });
  return result.success;
}
