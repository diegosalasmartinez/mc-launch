export interface FriendlyError {
  title: string;
  hint: string;
}

export function toFriendlyError(err: unknown): FriendlyError {
  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw.toLowerCase();

  if (
    /getaddrinfo|enotfound|econnrefused|enetunreach|fetch failed|failed after|etimedout|timeout|network/.test(
      msg,
    )
  ) {
    return {
      title: "Couldn’t reach Mojang’s servers.",
      hint: "Check your internet connection, then press Play to try again.",
    };
  }

  if (/sha1 mismatch|checksum/.test(msg)) {
    return {
      title: "A downloaded file didn’t check out.",
      hint: "Press Play again — the launcher will re-download and re-verify it.",
    };
  }

  if (/enospc|no space|disk full|disk space/.test(msg)) {
    return {
      title: "Not enough disk space.",
      hint: "Free up a few hundred MB and try again.",
    };
  }

  if (/no fabric build|no build for|not available|incompatible/.test(msg)) {
    return {
      title: "That add-on isn’t available for this version.",
      hint: "Try a different Minecraft version, or pick another one.",
    };
  }

  if (/no managed java|system java|spawn.*enoent|\bjava\b/.test(msg)) {
    return {
      title: "Couldn’t start Java.",
      hint: "The launcher downloads Java for you; if this keeps happening, restart the app and try again.",
    };
  }

  return {
    title: "Something went wrong while launching.",
    hint: raw,
  };
}
