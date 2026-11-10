/**
 * Migration script from v121 to v122.
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
 * It also repairs what this fork's earlier builds skipped. Those builds shipped
 * the TTS fields as v112 and then v113, so a config they saved carries that
 * number without having run upstream's step of the same number:
 * - `pageTranslation.node.shortcut` ("Alt+Q", upstream's v111-to-v112 field)
 *   is backfilled when missing.
 * - `videoSubtitles.autoStart` (upstream's v112-to-v113 split into one switch
 *   per platform) is turned from a boolean into that object, with the platforms
 *   v121 added (Bilibili, Udemy, edX) off.
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
    return repairSkippedSteps(oldConfig)
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
  return repairSkippedSteps(withTts)
}

function repairSkippedSteps(config: Record<string, any>): Record<string, any> {
  return splitAutoStart(backfillNodeShortcut(config))
}

function splitAutoStart(config: Record<string, any>): Record<string, any> {
  const videoSubtitles = config.videoSubtitles
  if (!isObject(videoSubtitles) || typeof videoSubtitles.autoStart !== "boolean") {
    return config
  }
  const enabled = videoSubtitles.autoStart
  return {
    ...config,
    videoSubtitles: {
      ...videoSubtitles,
      autoStart: {
        youtube: enabled,
        xcom: enabled,
        netflix: enabled,
        bilibili: false,
        udemy: false,
        edx: false,
      },
    },
  }
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
