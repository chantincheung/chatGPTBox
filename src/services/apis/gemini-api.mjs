import { getUserConfig } from '../../config/index.mjs'
import { Gemini } from '../clients/gemini'
import { pushRecord, setAbortController } from './shared.mjs'
import { getConversationPairs } from '../../utils/get-conversation-pairs.mjs'
// import { fetchSSE } from '../../utils/fetch-sse.mjs'

/**
 * @param {Browser.Runtime.Port} port
 * @param {string} question
 * @param {Session} session
 */
export async function generateAnswersWithGeminiApi(port, question, session) {
  const { controller, messageListener, disconnectListener } = setAbortController(port)
  const config = await getUserConfig()

  const gemini = new Gemini({
    config,
    fetch: globalThis.fetch,
  })

  const prompt = getConversationPairs(
    session.conversationRecords.slice(-config.maxConversationContextLength),
    false,
  )
  prompt.push({ role: 'user', content: question })

  try {
    const answer = await gemini.generateContent(question, {
      think: config.geminiEnableThink,
      signal: controller.signal,
    })

    pushRecord(session, question, answer)
    console.debug('conversation history', { content: session.conversationRecords })
    port.postMessage({ answer, done: true, session })
  } catch (error) {
    port.onMessage.removeListener(messageListener)
    port.onDisconnect.removeListener(disconnectListener)
    throw error
  }
}
