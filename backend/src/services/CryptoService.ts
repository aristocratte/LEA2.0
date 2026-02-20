import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Master key depuis env (générer avec: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
const encryptionKeyEnv = process.env.ENCRYPTION_MASTER_KEY;

if (!encryptionKeyEnv || encryptionKeyEnv.length !== 64) {
  throw new Error(
    'ENCRYPTION_MASTER_KEY must be set and must be 64 hex characters (32 bytes). ' +
    'Generate one with: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"'
  );
}

const MASTER_KEY = Buffer.from(encryptionKeyEnv, 'hex');

export interface EncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
}

export class CryptoService {

  /**
   * Chiffre une API key avec AES-256-GCM
   */
  static encrypt(plainText: string): EncryptedData {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv);

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  /**
   * Déchiffre une API key
   */
  static decrypt(encrypted: string, iv: string, authTag: string): string {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      MASTER_KEY,
      Buffer.from(iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Hash une API key pour vérification (SHA-256)
   */
  static hash(plainText: string): string {
    return crypto.createHash('sha256').update(plainText).digest('hex');
  }

  /**
   * Vérifie qu'une clé correspond au hash
   */
  static verify(plainText: string, hash: string): boolean {
    return this.hash(plainText) === hash;
  }

  /**
   * Masque une API key pour l'affichage
   */
  static mask(apiKey: string): string {
    if (apiKey.length < 12) return '****';
    return `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`;
  }

  /**
   * Génère une nouvelle master key (pour setup)
   */
  static generateMasterKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
