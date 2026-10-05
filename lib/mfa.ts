import { supabase } from '@/lib/supabase';

/**
 * True when the signed-in user has 2FA (authenticator app) turned on but this
 * session hasn't entered a code yet (still aal1), so the code screen must come
 * before anything else.
 */
export async function needsMfaCode(): Promise<boolean> {
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aal || aal.currentLevel === 'aal2') return false;
  // Ask the server as well: the stored session's factor list can be stale,
  // e.g. right after 2FA was turned on from the web app.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors) return factors.totp.length > 0;
  return aal.nextLevel === 'aal2';
}

/** Keeps only the digits of a typed/pasted code, max 6. */
export function cleanCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}
