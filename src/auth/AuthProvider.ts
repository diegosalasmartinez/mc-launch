// downstream only sees AuthResult, never the provider, so a real msa provider can drop in later.
export type UserType = "legacy" | "msa" | "mojang";

export interface AuthResult {
  username: string;
  uuid: string;
  accessToken: string;
  userType: UserType;
}

export interface AuthProvider {
  authenticate(): Promise<AuthResult>;
}
