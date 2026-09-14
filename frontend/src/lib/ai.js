import { HF_CONFIG } from '@/config/ai'
import { ollamaChat } from '@/lib/ollama'
import { API_ENDPOINTS } from '@/config/apiEndpoints'

const SYSTEM_PROMPT = `You are a helpful assistant that ONLY answers using the provided Elasticsearch metadata context.

Rules:
- The context is JSON with keys: total (number) and hits.hits (array of dataset records in _source).
- If asked for totals or counts (e.g., total metadata count), answer using the 'total' field from context.
- If asked where a dataset is located, return the pygeoapi link: ${API_ENDPOINTS.PYGEOAPI.BASE}${API_ENDPOINTS.PYGEOAPI.METADATA_ITEM_BY_ID('{id}')}.
- If multiple matches are possible, list the top 5 few with their titles and links.
- If the answer is not in context, say you do not know.
- Do NOT output JSON, code blocks, or markdown tables. Use plain sentences and short bullet points when listing.
- Be brief and factual.
- For greetings or vague questions (e.g., hi, hello), reply with a short friendly greeting and offer help specifically with metadata queries (counts, sizes, top countries/topics, dataset links). Do not say you lack context for greetings.
- Country information is in properties.country_long_name and properties.country_short_name.
- Topic/theme information is in properties.topic_value and properties.themes.
- Answers must be one to three sentences maximum, unless listing items.`

export async function chatWithContext({ model = HF_CONFIG.model, context, question, max_tokens = HF_CONFIG.maxNewTokens }) {
  const resp = await fetch('/hf/together/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${HF_CONFIG.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + '\n\nContext:\n' + context },
        { role: 'user', content: question }
      ],
      max_tokens
    })
  })
  if (!resp.ok) throw new Error(`HF router error ${resp.status}`)
  const data = await resp.json()
  return data?.choices?.[0]?.message?.content || ''
}

// Ollama equivalent of chatWithContext. Mirrors message shape for easy swap.
// Available models: qwen2.5:0.5b-instruct, llama3.2:latest
export async function chatWithContextOllama({ model = 'llama3.2:latest', context, question, max_tokens = 512 }) {
const content = await ollamaChat({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT + '\n\nContext:\n' + (context || '') },
      { role: 'user', content: question }
    ],
    stream: false,
    options: { num_predict: max_tokens, temperature: 0.1, num_ctx: 8192 }
  })
  return content
}


