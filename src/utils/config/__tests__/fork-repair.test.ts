import { describe, expect, it } from "vitest"
import { repairForkConfigVersion } from "../fork-repair"

const autoStart = { youtube: true, xcom: false, netflix: false }

describe("repairForkConfigVersion", () => {
  it("keeps the version of a config upstream's chain fully migrated", () => {
    const config = { videoSubtitles: { autoStart } }
    expect(repairForkConfigVersion(config, 121, 121)).toBe(121)
    expect(repairForkConfigVersion(config, 100, 121)).toBe(100)
  })

  it("reruns upstream's v113 for the fork's v113, which kept a boolean autoStart", () => {
    const config = { videoSubtitles: { autoStart: true } }
    expect(repairForkConfigVersion(config, 113, 121)).toBe(112)
  })

  it("puts the fork's v122 back to upstream's v121", () => {
    const config = { videoSubtitles: { autoStart } }
    expect(repairForkConfigVersion(config, 122, 121)).toBe(121)
  })

  it("leaves v122 alone once upstream has its own", () => {
    const config = { videoSubtitles: { autoStart } }
    expect(repairForkConfigVersion(config, 122, 122)).toBe(122)
    expect(repairForkConfigVersion(config, 122, 123)).toBe(122)
  })
})
