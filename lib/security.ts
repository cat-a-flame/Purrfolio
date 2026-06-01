import * as SecureStore from 'expo-secure-store';

// expo-local-authentication requires a native build (not Expo Go).
// Load it lazily so the app doesn't crash when the native module is absent.
let LA: typeof import('expo-local-authentication') | null = null;
try {
  LA = require('expo-local-authentication');
} catch {
  LA = null;
}

const KEY_PIN = 'purrfolio_pin';
const KEY_PIN_ENABLED = 'purrfolio_pin_enabled';
const KEY_FACE_ENABLED = 'purrfolio_face_enabled';
const KEY_FINGERPRINT_ENABLED = 'purrfolio_fingerprint_enabled';

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
  await SecureStore.setItemAsync(KEY_FACE_ENABLED, 'false');
  await SecureStore.setItemAsync(KEY_FINGERPRINT_ENABLED, 'false');
}

export async function isFaceEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY_FACE_ENABLED)) === 'true';
}

export async function setFaceEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEY_FACE_ENABLED, enabled ? 'true' : 'false');
}

export async function isFingerprintEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY_FINGERPRINT_ENABLED)) === 'true';
}

export async function setFingerprintEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEY_FINGERPRINT_ENABLED, enabled ? 'true' : 'false');
}

// Returns which biometric types the device hardware supports
export async function getSupportedBiometrics(): Promise<{ face: boolean; fingerprint: boolean }> {
  if (!LA) return { face: false, fingerprint: false };
  try {
    const hasHardware = await LA.hasHardwareAsync();
    const isEnrolled = await LA.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) return { face: false, fingerprint: false };
    const types = await LA.supportedAuthenticationTypesAsync();
    return {
      face: types.includes(LA.AuthenticationType.FACIAL_RECOGNITION),
      fingerprint: types.includes(LA.AuthenticationType.FINGERPRINT),
    };
  } catch {
    return { face: false, fingerprint: false };
  }
}

export async function isBiometricsEnabled(): Promise<boolean> {
  const [face, fingerprint] = await Promise.all([isFaceEnabled(), isFingerprintEnabled()]);
  return face || fingerprint;
}

export async function authenticateWithBiometrics(): Promise<boolean> {
  if (!LA) return false;
  try {
    const result = await LA.authenticateAsync({
      promptMessage: 'Unlock Purrfolio',
      disableDeviceFallback: true,
      cancelLabel: 'Use PIN',
    });
    return result.success;
  } catch {
    return false;
  }
}
