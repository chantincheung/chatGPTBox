// api version

import { getUserConfig } from '../../config/index.mjs'
import { fetchSSE } from '../../utils/fetch-sse.mjs'
import { getConversationPairs } from '../../utils/get-conversation-pairs.mjs'
import { isEmpty } from 'lodash-es'
import { getCompletionPromptBase, pushRecord, setAbortController } from './shared.mjs'
import { getModelValue } from '../../utils/model-name-convert.mjs'

/**
 * 获取思考模式的提示词
 * @param {string} question 用户问题
 * @returns {string} 带有思考模式的问题
 */
async function getChainOfThoughtPrompt(question) {
  const config = await getUserConfig()
  if (!config.chainOfThought) return question

  return `让我们一步一步思考这个问题:
1. 首先理解问题要求:
${question}

2. 分析关键信息并制定解决方案:
让我思考一下这个问题需要考虑的几个要点...

3. 根据以上分析,我的回答是:
`
}

/**
 * @param {Browser.Runtime.Port} port
 * @param {string} question
 * @param {Session} session
 * @param {string} apiKey
 */
export async function generateAnswersWithGptCompletionApi(port, question, session, apiKey) {
  const { controller, messageListener, disconnectListener } = setAbortController(port)
  const model = getModelValue(session)

  const config = await getUserConfig()
  const prompt =
    (await getCompletionPromptBase()) +
    getConversationPairs(
      session.conversationRecords.slice(-config.maxConversationContextLength),
      true,
    ) +
    `Human: ${await getChainOfThoughtPrompt(question)}\nAI: `
  const apiUrl = config.customOpenAiApiUrl

  let answer = ''
  let finished = false
  const finish = () => {
    finished = true
    pushRecord(session, question, answer)
    console.debug('conversation history', { content: session.conversationRecords })
    port.postMessage({ answer: null, done: true, session: session })
  }
  await fetchSSE(`${apiUrl}/v1/completions`, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: prompt,
      model,
      stream: true,
      max_tokens: config.maxResponseTokenLength,
      temperature: config.temperature,
      stop: '\nHuman',
    }),
    onMessage(message) {
      console.debug('sse message', message)
      if (finished) return
      if (message.trim() === '[DONE]') {
        finish()
        return
      }
      let data
      try {
        data = JSON.parse(message)
      } catch (error) {
        console.debug('json error', error)
        return
      }

      answer += data.choices[0].text
      port.postMessage({ answer: answer, done: false, session: null })

      if (data.choices[0]?.finish_reason) {
        finish()
        return
      }
    },
    async onStart() {},
    async onEnd() {
      port.postMessage({ done: true })
      port.onMessage.removeListener(messageListener)
      port.onDisconnect.removeListener(disconnectListener)
    },
    async onError(resp) {
      port.onMessage.removeListener(messageListener)
      port.onDisconnect.removeListener(disconnectListener)
      if (resp instanceof Error) throw resp
      const error = await resp.json().catch(() => ({}))
      throw new Error(!isEmpty(error) ? JSON.stringify(error) : `${resp.status} ${resp.statusText}`)
    },
  })
}

/**
 * @param {Browser.Runtime.Port} port
 * @param {string} question
 * @param {Session} session
 * @param {string} apiKey
 */
export async function generateAnswersWithChatgptApi(port, question, session, apiKey) {
  const config = await getUserConfig()
  return generateAnswersWithChatgptApiCompat(
    config.customOpenAiApiUrl + '/v1',
    port,
    question,
    session,
    apiKey,
  )
}

export async function generateAnswersWithChatgptApiCompat(
  baseUrl,
  port,
  question,
  session,
  apiKey,
  extraBody = {},
) {
  const config = await getUserConfig()
  const { controller, messageListener, disconnectListener } = setAbortController(port)
  const model = getModelValue(session)

  let contextMessages = session.conversationRecords
    .slice(-config.maxConversationContextLength)
    .map((r) => ({
      role: 'user',
      content: r.question,
    }))
    .map((r, i) => {
      if (i % 2 === 0)
        return {
          role: 'user',
          content: config.chainOfThought ? getChainOfThoughtPrompt(r.content) : r.content,
        }
      return { role: 'assistant', content: r.content }
    })

  const prompt = getConversationPairs(contextMessages, false)
  prompt.push({ role: 'user', content: question })

  let answer = ''
  let finished = false
  const finish = () => {
    finished = true
    pushRecord(session, question, answer)
    console.debug('conversation history', { content: session.conversationRecords })
    port.postMessage({ answer: null, done: true, session: session })
  }
  await fetchSSE(`${baseUrl}/chat/completions`, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      messages: prompt,
      model,
      stream: true,
      max_tokens: config.maxResponseTokenLength,
      temperature: config.temperature,
      ...extraBody,
    }),
    onMessage(message) {
      console.debug('sse message', message)
      if (finished) return
      if (message.trim() === '[DONE]') {
        finish()
        return
      }
      let data
      try {
        data = JSON.parse(message)
      } catch (error) {
        console.debug('json error', error)
        return
      }

      const delta = data.choices[0]?.delta?.content
      const content = data.choices[0]?.message?.content
      const text = data.choices[0]?.text
      if (delta !== undefined) {
        answer += delta
      } else if (content) {
        answer = content
      } else if (text) {
        answer += text
      }
      port.postMessage({ answer: answer, done: false, session: null })

      if (data.choices[0]?.finish_reason) {
        finish()
        return
      }
    },
    async onStart() {},
    async onEnd() {
      port.postMessage({ done: true })
      port.onMessage.removeListener(messageListener)
      port.onDisconnect.removeListener(disconnectListener)
    },
    async onError(resp) {
      port.onMessage.removeListener(messageListener)
      port.onDisconnect.removeListener(disconnectListener)
      if (resp instanceof Error) throw resp
      const error = await resp.json().catch(() => ({}))
      throw new Error(!isEmpty(error) ? JSON.stringify(error) : `${resp.status} ${resp.statusText}`)
    },
  })
}
