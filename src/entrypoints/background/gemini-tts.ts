import { createLogger } from "@/utils/logging/logger"
import { onMessage } from "@/utils/message"
import { listGeminiTTSVoices, synthesizeGeminiTTS } from "@/utils/server/gemini-tts"

const log = createLogger("background/gemini-tts")

export function setupGeminiTTSMessageHandlers() {
  onMessage("geminiTtsSynthesize", async (message) => {
    const response = await synthesizeGeminiTTS(message.data)
    if (!response.ok) {
      log.warn("Synthesize failed", { error: response.error })
    }
    return response
  })

  onMessage("geminiTtsListVoices", async (message) => {
    const response = await listGeminiTTSVoices(message.data)
    if (!response.ok) {
      log.warn("Listing voices failed", { error: response.error })
    }
    return response
  })
}
