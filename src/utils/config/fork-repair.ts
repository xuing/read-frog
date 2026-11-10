/**
 * Fork-only. This fork adds settings without its own config schema version, so
 * `CONFIG_SCHEMA_VERSION` and the migration chain stay upstream's and merge
 * without conflicts.
 *
 * Earlier builds of the fork did take version numbers (v113, then v122),
 * so a config they saved carries a number without having run upstream's step
 * of that number. This puts the version back to where upstream's chain should
 * pick up; upstream's migrations are idempotent, so running them again is safe.
 * Left alone, such a config fails the schema and is replaced by the defaults.
 */

function isObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

const FORK_ONLY_VERSION = 122

export function repairForkConfigVersion(
  config: unknown,
  storedVersion: number,
  latestVersion: number,
): number {
  if (!isObject(config)) {
    return storedVersion
  }

  // Upstream's v112-to-v113 splits `videoSubtitles.autoStart` per platform.
  const videoSubtitles = config.videoSubtitles
  if (
    storedVersion >= 113 &&
    isObject(videoSubtitles) &&
    typeof videoSubtitles.autoStart === "boolean"
  ) {
    return 112
  }

  // The fork's v122 was upstream's v121 plus TTS fields the schema defaults.
  if (storedVersion === FORK_ONLY_VERSION && latestVersion === FORK_ONLY_VERSION - 1) {
    return latestVersion
  }

  return storedVersion
}
