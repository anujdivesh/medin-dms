// Minimal client for Ollama running via docker-compose on http://localhost:11434
// In dev, we call through Vite proxy at /ollama to avoid CORS.

const OLLAMA_BASE = '/ollama'

export async function ollamaChat({ model = 'qwen2.5:0.5b-instruct', messages, stream = false, options = {} }) {
  const resp = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream, options })
  })
  if (!resp.ok) throw new Error(`Ollama error ${resp.status}`)
  if (stream) return resp.body
  const data = await resp.json()
  return data?.message?.content || ''
}

export async function ollamaGenerate({ model = 'qwen2.5:0.5b-instruct', prompt, stream = false, options = {} }) {
  const resp = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream, options })
  })
  if (!resp.ok) throw new Error(`Ollama error ${resp.status}`)
  if (stream) return resp.body
  const text = await resp.text()
  return text
}


