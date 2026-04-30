import { createHash, randomBytes } from 'node:crypto';

export interface PKCEPair {
  verifier: string;
  challenge: string;
}

/**
 * Generate a PKCE verifier and challenge for OAuth flow
 */
export function generatePKCE(): PKCEPair {
  // Generate a random verifier (43-128 characters)
  // Using 32 bytes = 256 bits gives us 43 characters when base64url encoded
  const verifier = randomBytes(32).toString('base64url');

  // Generate challenge by hashing verifier with SHA256 and base64url encoding
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  return {
    verifier,
    challenge,
  };
}
