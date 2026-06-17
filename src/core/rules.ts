import type { Rule } from "../types/version.js";
import { getHostPlatform, type HostPlatform } from "../config/platform.js";

// vanilla semantics: start denied, walk rules in order, last matching rule wins.
// features (demo mode, custom resolution) are all-false here, so feature-gated entries are excluded.
export function rulesAllow(
  rules: Rule[] | undefined,
  host: HostPlatform = getHostPlatform(),
): boolean {
  if (!rules || rules.length === 0) return true;

  let allowed = false;
  for (const rule of rules) {
    if (ruleMatches(rule, host)) {
      allowed = rule.action === "allow";
    }
  }
  return allowed;
}

function ruleMatches(rule: Rule, host: HostPlatform): boolean {
  if (rule.features) {
    // no optional features supported; any required feature fails the match
    for (const enabled of Object.values(rule.features)) {
      if (enabled) return false;
    }
  }

  if (rule.os) {
    if (rule.os.name && rule.os.name !== host.os) return false;
    if (rule.os.arch && rule.os.arch !== host.arch) return false;
    // os.version is a regex against the os version; rarely used, skipped
  }

  return true;
}
