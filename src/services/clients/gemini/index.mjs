export class Gemini {
  constructor({ config, fetch }) {
    if (fetch) {
      this.fetch = fetch
    }
    this.config = config
  }

  /**
   * Get available models.
   * @returns {string[]} Array of model names
   */
  models() {
    return [
      'models/gemini-2.5-flash-preview-05-20',
      'models/gemini-2.0-flash',
      'models/gemini-2.0-pro-exp-02-05',
    ]
  }

  /**
   * Get the default model.
   * @returns {string} Default model name
   */
  defaultModel() {
    return 'models/gemini-2.5-flash-preview-05-20'
  }

  async generateContent(input, options = {}) {
    const endpointUrl =
      this.config.customGeminiApiUrl +
      '/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent'

    const request = {
      contents: [
        {
          parts: [
            {
              text: input,
            },
          ],
        },
      ],
      safetySettings: {
        HARASSMENT: 'BLOCK_NONE',
        HATE_SPEECH: 'BLOCK_NONE',
        SEXUALLY_EXPLICIT: 'BLOCK_NONE',
        DANGEROUS_CONTENT: 'BLOCK_NONE',
      },
      generationConfig: {
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxResponseTokenLength,
        responseMode: options.think ? 'REASONING' : 'STANDARD',
      },
    }

    const response = await this.fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.kimiGeminiApiKey}`,
      },
      body: JSON.stringify(request),
    })

    const data = await response.json()
    return data.candidates[0].content.parts[0].text
  }
}
