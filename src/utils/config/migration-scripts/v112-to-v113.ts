/**
 * Migration script from v112 to v113.
 *
 * Adds a TTS provider choice. `tts.provider` says which engine reads aloud
 * ("edge-tts" keeps every existing reader where they were), and `tts.gemini`
 * holds what Gemini TTS needs: the Google provider from API Providers whose
 * API key it uses, its model, prebuilt voice and voice style.
 *
 * The first enabled Google provider is preselected, so switching the engine
 * to Gemini works without another trip to API Providers.
 *
 * Each part is applied on its own, not skipped because another is there: a UI
 * context that loaded ahead of this migration and saved a setting has stored
 * the schema's defaults (Edge TTS, a `gemini` block with no provider) with the
 * config still marked v112, and may even have switched to Gemini. So a missing
 * `provider` starts as Edge TTS, a missing `gemini` field takes its default,
 * and a missing or empty `gemini.providerId` takes the first enabled Google
 * provider; values already there are kept. A config that needs none of it (a
 * second run) is returned by identity.
 *
 * It also backfills `pageTranslation.node.shortcut` ("Alt+Q", upstream's
 * v111-to-v112 field). An earlier build of this fork shipped the TTS fields as
 * v112, so a config it saved is marked v112 without ever running upstream's
 * v112 step; the schema requires the shortcut, and the shortcut code reads it.
 *
 * IMPORTANT: This is a frozen snapshot. It imports nothing from the evolving
 * application code.
 */

const GEMINI_DEFAULTS: Record<string, string> = {
  model: "gemini-3.8-flash-lite-tts",
  voice: "kore",
  style: "",
}

function isObject(value: any): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function findGoogleProviderId(providersConfig: any): string | null {
  const providers = Array.isArray(providersConfig) ? providersConfig : []
  const googleProvider = providers.find((p: any) => p?.provider === "google" && p?.enabled === true)
  return typeof googleProvider?.id === "string" ? googleProvider.id : null
}

export function migrate(oldConfig: any): any {
  if (!isObject(oldConfig)) {
    return oldConfig
  }
  if (!isObject(oldConfig.tts)) {
    return backfillNodeShortcut(oldConfig)
  }

  const tts = oldConfig.tts
  const next: Record<string, any> = { ...tts }
  let changed = false

  if (typeof tts.provider !== "string") {
    next.provider = "edge-tts"
    changed = true
  }

  const gemini: Record<string, any> = isObject(tts.gemini) ? { ...tts.gemini } : {}
  let geminiChanged = !isObject(tts.gemini)
  for (const [key, value] of Object.entries(GEMINI_DEFAULTS)) {
    if (typeof gemini[key] !== "string") {
      gemini[key] = value
      geminiChanged = true
    }
  }
  if (typeof gemini.providerId !== "string") {
    const providerId = findGoogleProviderId(oldConfig.providersConfig)
    if (gemini.providerId !== providerId) {
      gemini.providerId = providerId
      geminiChanged = true
    }
  }
  if (geminiChanged) {
    next.gemini = gemini
    changed = true
  }

  const withTts = changed ? { ...oldConfig, tts: next } : oldConfig
  return backfillNodeShortcut(withTts)
}

function backfillNodeShortcut(config: Record<string, any>): Record<string, any> {
  const pageTranslation = config.pageTranslation
  if (!isObject(pageTranslation) || !isObject(pageTranslation.node)) {
    return config
  }
  if (typeof pageTranslation.node.shortcut === "string") {
    return config
  }
  return {
    ...config,
    pageTranslation: {
      ...pageTranslation,
      node: { ...pageTranslation.node, shortcut: "Alt+Q" },
    },
  }
}
