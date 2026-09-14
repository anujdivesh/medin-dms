import React, { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ollamaChat } from '@/lib/ollama'
import { chatWithContextOllama } from '@/lib/ai'
import { elasticsearchService } from '@/lib/elasticsearchService'
import { API_ENDPOINTS } from '@/config/apiEndpoints'
import { Fish as FishSymbol } from 'lucide-react'

function OllamaQuickTest() {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState([]) // { role: 'user'|'assistant', content: string }
  const [loadingContext, setLoadingContext] = useState(false)
  const [contextText, setContextText] = useState('')
  const [contextInfo, setContextInfo] = useState('')
  const [contextItems, setContextItems] = useState([]) // [{id,title}]
  const messagesRef = useRef(null)

  const handleSend = async () => {
    const trimmed = (prompt || '').trim()
    if (!trimmed || busy) return
    const userMsg = { role: 'user', content: trimmed }
    setMessages((prev) => [...prev, userMsg])
    setPrompt('')
    setBusy(true)
    try {
      // Always ensure context is loaded
      if (!contextText) {
        await loadContext()
      }
      let content
      if (contextText) {
        content = await chatWithContextOllama({
          context: contextText,
          question: trimmed,
        })
      } else {
        content = await ollamaChat({ messages: [userMsg] })
      }
      setMessages((prev) => [...prev, { role: 'assistant', content }])
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${e?.message || 'Request failed'}` },
      ])
    } finally {
      setBusy(false)
    }
  }

  function renderContentWithLinks(text) {
    if (!text || typeof text !== 'string') return text
    // Only linkify specific metadata item links from pygeoapi
    const urlRegex = new RegExp(`(${API_ENDPOINTS.PYGEOAPI.BASE}/collections/[\\w-]+/items/[\\w.-]+)`, 'g')
    const parts = []
    let lastIndex = 0
    let match
    while ((match = urlRegex.exec(text)) !== null) {
      const [matchedUrl] = match
      const start = match.index
      if (start > lastIndex) {
        parts.push(text.slice(lastIndex, start))
      }
      // Trim trailing punctuation from URL but keep it in the text
      const trimmed = matchedUrl.replace(/[.,);:"']+$/, '')
      const trailing = matchedUrl.slice(trimmed.length)
      parts.push(
        <a
          key={`link-${start}`}
          href={trimmed}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-primary break-all"
        >
          {trimmed}
        </a>
      )
      if (trailing) parts.push(trailing)
      lastIndex = start + matchedUrl.length
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex))
    }
    return parts
  }

  const loadContext = async () => {
    if (loadingContext) return
    setLoadingContext(true)
    try {
      const res = await elasticsearchService.searchMetadata(1000, 0)
      const total = res?.total ?? (res?.data?.length || 0)
      const rows = res?.data || []
      // Build compact summary to guide the model
      const byType = {}
      const byCountry = {}
      let knownSizeBytes = 0
      for (const r of rows) {
        const t = r.type || 'Unknown'
        byType[t] = (byType[t] || 0) + 1
        const c = r.country || 'Unknown'
        byCountry[c] = (byCountry[c] || 0) + 1
        // Try to detect a size field if present in raw
        const sz = r?.rawData?.properties?.size_bytes
        if (typeof sz === 'number') knownSizeBytes += sz
      }
      const payload = {
        total,
        counts: {
          byType,
          byCountry,
        },
        knownSizeBytes,
        sample: rows.slice(0, 20).map(r => ({ id: r.id, title: r.title, type: r.type, country: r.country })),
      }
      const text = JSON.stringify(payload)
      setContextText(text)
      // setContextInfo(`Loaded ${rows.length} records (total: ${total}). Context size: ${text.length.toLocaleString()} chars`)
      setContextInfo(`Loaded ${rows.length} records (total: ${total}).`)
      setContextItems(rows.map(r => ({ id: r.id, title: r.title })).filter(x => x.id && x.title))
    } catch (e) {
      setContextText('')
      setContextInfo(`Failed to load context: ${e?.message || 'error'}`)
    } finally {
      setLoadingContext(false)
    }
  }

  useEffect(() => {
    // Preload context on mount so EchoDepth always has metadata
    if (!contextText) {
      loadContext()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Auto-scroll to bottom on new messages
    const el = messagesRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, busy])

  return (
    <div className="absolute inset-0 p-2 flex flex-col">
      <Separator className="my-2" />
      <div className="text-xs font-medium mb-2 text-sidebar-foreground/70">EchoDepth</div>
      <div className="flex items-center gap-2 mb-2">
        {/* <Button variant="outline" size="sm" disabled={loadingContext} onClick={loadContext}>
          {loadingContext ? 'Loading…' : 'Reload context'}
        </Button> */}
      </div>
      <div className="text-[10px] text-muted-foreground mb-2">{contextInfo || 'Loading metadata context…'}</div>
      
      {/* Messages area - takes remaining space minus input height */}
      <div ref={messagesRef} className="border rounded-md p-2 flex-1 overflow-y-auto bg-background/50 mb-2 min-h-0">
        {messages.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            Meet EchoDept – your smart companion for navigating metadata.
            EchoDept specializes in searching, analyzing, and answering metadata-related questions.
            Whether you need quick insights, precise details, or context around your stored data,
            EchoDept makes exploring metadata simple, efficient, and reliable.
      </div>
        ) : (
          <div className="space-y-2 text-xs">
            {messages.map((m, idx) => {
              const isAssistant = m.role !== 'user'
              // If assistant references known dataset titles, render links below
              let related = []
              if (isAssistant && typeof m.content === 'string' && contextItems.length) {
                const lc = m.content.toLowerCase()
                for (const it of contextItems) {
                  const t = String(it.title || '').toLowerCase()
                  if (t && lc.includes(t)) {
                    related.push(it)
                    if (related.length >= 3) break
                  }
                }
              }
              return (
                <div key={idx} className={isAssistant ? 'text-muted-foreground' : 'text-foreground'}>
                  {isAssistant ? (
                    <div className="flex items-start gap-2">
                      <FishSymbol className="h-4 w-4 mt-0.5 opacity-80" />
                      <div>
                        <div className="font-medium mb-0.5">EchoDepth</div>
                        <div className="whitespace-pre-wrap break-words">{renderContentWithLinks(m.content)}</div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span className="font-medium mr-1">You:</span>
                      <span className="whitespace-pre-wrap break-words">{renderContentWithLinks(m.content)}</span>
                    </div>
                  )}
                  {isAssistant && related.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {related.map((it, i) => (
                        <div key={`${it.id}-${i}`}>
                          <a
                            href={`${API_ENDPOINTS.PYGEOAPI.BASE}${API_ENDPOINTS.PYGEOAPI.METADATA_ITEM_BY_ID(it.id, it.metadataType?.toLowerCase() || API_ENDPOINTS.PYGEOAPI.DEFAULT_COLLECTION)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline text-primary break-all"
                          >
                            {it.title}
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {busy && (
              <div className="text-muted-foreground">EchoDepth is thinking…</div>
            )}
          </div>
        )}
      </div>
      
      {/* Input absolutely positioned at bottom */}
      <div className="flex gap-2 h-10 items-center">
        <Input
          placeholder={busy ? 'EchoDepth is thinking…' : 'Ask EchoDepth…'}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSend()
            }
          }}
          disabled={busy}
          aria-busy={busy}
          className="h-8"
        />
        <Button variant="outline" size="sm" disabled={busy} onClick={handleSend}>
          {busy ? '...' : 'Send'}
        </Button>
      </div>
    </div>
  )
}

export default OllamaQuickTest


