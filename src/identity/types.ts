export type AuthProvider = "independent" | "patreon";

export type UserAccount = {
  user_id: string;
  creator_id: string;
  email: string;
  password_hash: string;
  auth_provider: AuthProvider;
  patreon_user_id?: string;
  tier_ids: string[];
  created_at: string;
  updated_at: string;
};

export type SessionToken = {
  token: string;
  user_id: string;
  creator_id: string;
  tier_ids: string[];
  expires_at: string;
};

export type IdentityStoreRoot = {
  users: Record<string, UserAccount>;
  sessions: Record<string, SessionToken>;
};
