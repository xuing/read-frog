import { describe, expect, it } from "vitest"
import { configSchema } from "@/types/config/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { migrate } from "../../migration-scripts/v121-to-v122"
import { testSeries as v121TestSeries } from "../example/v121"

function v121Tts() {
  const { provider: _provider, gemini: _gemini, ...tts } = DEFAULT_CONFIG.tts
  return tts
}

const GOOGLE_PROVIDERS = [
  { id: "openai-default", provider: "openai", enabled: true },
  { id: "google-off", provider: "google", enabled: false },
  { id: "google-on", provider: "google", enabled: true },
]

describe("v121-to-v122 migration", () => {
  it("keeps Edge TTS as the provider and adds the Gemini defaults", () => {
    const migrated = migrate({ tts: v121Tts(), providersConfig: [] })

    expect(migrated.tts).toEqual({
      ...v121Tts(),
      provider: "edge-tts",
      gemini: { providerId: null, model: "gemini-3.8-flash-lite-tts", voice: "kore", style: "" },
    })
  })

  it("preselects the first enabled Google provider", () => {
    const migrated = migrate({ tts: v121Tts(), providersConfig: GOOGLE_PROVIDERS })

    expect(migrated.tts.gemini.providerId).toBe("google-on")
  })

  it("produces a config the v122 schema accepts", () => {
    const config = { ...structuredClone(DEFAULT_CONFIG), tts: v121Tts() }
    expect(configSchema.safeParse(migrate(config)).success).toBe(true)
  })

  it("returns the config by identity once the fields are there", () => {
    const once = migrate({ tts: v121Tts(), providersConfig: GOOGLE_PROVIDERS })
    expect(migrate(once)).toBe(once)
  })

  it("keeps a Gemini choice saved before the migration ran", () => {
    // A UI context that loaded ahead of the migration can store v122 fields under v121.
    const config = {
      tts: {
        ...v121Tts(),
        provider: "gemini",
        gemini: {
          providerId: "google-off",
          model: "gemini-2.5-pro-preview-tts",
          voice: "puck",
          style: "calm",
        },
      },
      providersConfig: GOOGLE_PROVIDERS,
    }
    expect(migrate(config)).toBe(config)
  })

  it("preselects a Google provider for the schema default a UI context wrote back", () => {
    const config = {
      tts: {
        ...v121Tts(),
        provider: "edge-tts",
        gemini: { providerId: null, model: "gemini-3.8-flash-tts", voice: "puck", style: "calm" },
      },
      providersConfig: GOOGLE_PROVIDERS,
    }

    expect(migrate(config).tts.gemini).toEqual({
      providerId: "google-on",
      model: "gemini-3.8-flash-tts",
      voice: "puck",
      style: "calm",
    })
  })

  it("leaves a config without tts alone", () => {
    const config = { language: {} }
    expect(migrate(config)).toBe(config)
  })

  it("backfills the hover shortcut a config from this fork's earlier build lacks", () => {
    const config = {
      tts: { ...v121Tts(), provider: "gemini", gemini: DEFAULT_CONFIG.tts.gemini },
      pageTranslation: { node: { enabled: true, hotkey: "alt", forceRetranslation: false } },
    }

    expect(migrate(config).pageTranslation.node).toEqual({
      enabled: true,
      hotkey: "alt",
      shortcut: "Alt+Q",
      forceRetranslation: false,
    })
    expect(migrate(config).tts).toBe(config.tts)
  })

  it("keeps a hover shortcut that is already there", () => {
    const config = { pageTranslation: { node: { hotkey: "custom", shortcut: "Ctrl+K" } } }
    expect(migrate(config)).toBe(config)
  })
})

describe("v121-to-v122 repair of this fork's earlier v113", () => {
  it("splits a boolean autoStart into per-platform switches", () => {
    const config = { videoSubtitles: { enabled: true, autoStart: true } }

    expect(migrate(config).videoSubtitles.autoStart).toEqual({
      youtube: true,
      xcom: true,
      netflix: true,
      bilibili: false,
      udemy: false,
      edx: false,
    })
  })

  it("keeps an autoStart object as it is", () => {
    const config = { videoSubtitles: { autoStart: { youtube: true, xcom: false, netflix: false } } }
    expect(migrate(config)).toBe(config)
  })
})

describe("v122 schema upgrade window", () => {
  it("still parses a v121 config before the background has migrated it", () => {
    // Otherwise a UI context reads DEFAULT_CONFIG and its next write saves that over the user's.
    for (const { config } of Object.values(v121TestSeries)) {
      const result = configSchema.safeParse(config)
      expect(result.success).toBe(true)
      expect(result.data?.tts.provider).toBe("edge-tts")
    }
  })
})
