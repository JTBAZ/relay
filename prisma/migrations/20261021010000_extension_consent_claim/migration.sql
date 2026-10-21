-- PS13: reuse private OAuth transaction hashes for one-use extension consent across API instances.
ALTER TYPE "OAuthTransactionPurpose" ADD VALUE IF NOT EXISTS 'extension_consent';
