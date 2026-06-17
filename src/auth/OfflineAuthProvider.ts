import { createHash } from "node:crypto";
import type { AuthProvider, AuthResult } from "./AuthProvider.js";

export class OfflineAuthProvider implements AuthProvider {
  constructor(private readonly username: string) {
    if (!username.trim()) throw new Error("Username must not be empty.");
  }

  authenticate(): Promise<AuthResult> {
    return Promise.resolve({
      username: this.username,
      uuid: offlineUuid(this.username),
      accessToken: "0",
      userType: "legacy",
    });
  }
}

// name-based UUIDv3 over "OfflinePlayer:<name>", matching vanilla offline play.
export function offlineUuid(username: string): string {
  const md5 = createHash("md5")
    .update(`OfflinePlayer:${username}`)
    .digest();

  // set RFC 4122 version (3) and variant bits, like Java's UUID.nameUUIDFromBytes
  md5[6] = (md5[6]! & 0x0f) | 0x30;
  md5[8] = (md5[8]! & 0x3f) | 0x80;

  const hex = md5.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
