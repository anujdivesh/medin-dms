import { useEffect, useRef, useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Home,
  FileText,
  Loader2
} from 'lucide-react'
import { elasticsearchService } from '@/lib/elasticsearchService'
import { API_ENDPOINTS } from '@/config/apiEndpoints'

function QuickSearch({ open, onOpenChange }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [mode, setMode] = useState('routes') // 'routes' | 'metadata'
  const [metadataSuggestions, setMetadataSuggestions] = useState([])
  const [metadataLoading, setMetadataLoading] = useState(false)
  const inputRef = useRef(null)
  const itemsRef = useRef([])
  const debounceRef = useRef(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
    }
    // reset highlight when opening/closing
    setHighlightIndex(-1)
  }, [open])

  const routes = useMemo(() => [
    { title: 'Home', path: '/Home', icon: Home },
  ], [])

  // Determine suggestions based on mode
  const suggestions = useMemo(() => {
    if (mode === 'metadata') {
      return metadataSuggestions.map(m => ({ title: m.title, id: m.id, type: 'metadata', icon: FileText }))
    }
    return routes.filter(r => r.title.toLowerCase().includes(query.toLowerCase()))
  }, [mode, metadataSuggestions, routes, query])

  // Fetch metadata suggestions when in metadata mode and query changes (debounced)
  useEffect(() => {
    if (mode !== 'metadata') return undefined
    if (!query || query.trim().length < 2) {
      setMetadataSuggestions([])
      return undefined
    }

    setMetadataLoading(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const filters = { title: query.trim(), size: 10 }
        const res = await elasticsearchService.searchMetadataWithFilters(filters)
        // expect res.data to be array of items with id and title
        let items = (res && res.data) ? res.data.map(it => ({ id: it.id, title: it.title })) : []

        // If nothing found by title and the query looks like an id, try exact id lookup
        const isPossibleId = (q) => {
          // heuristic: UUID-like (dashes + hex) or mostly-numeric id
          const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          const numericLike = /^\d{3,}$/
          return uuidLike.test(q) || numericLike.test(q) || q.length > 16
        }

        if (items.length === 0 && isPossibleId(query.trim())) {
          try {
            // exact id term query
            const idQuery = { term: { 'id.keyword': query.trim() } }
            const idRes = await elasticsearchService.searchMetadata(1, 0, idQuery)
            const idItems = (idRes && idRes.data) ? idRes.data.map(it => ({ id: it.id, title: it.title })) : []
            if (idItems.length > 0) items = idItems
          } catch {
            // ignore id lookup errors, already logged elsewhere
          }
        }

        setMetadataSuggestions(items)
      } catch (err) {
        console.error('QuickSearch metadata lookup failed', err)
        setMetadataSuggestions([])
      } finally {
        setMetadataLoading(false)
      }
    }, 250)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [mode, query])

  // keep highlightIndex valid when suggestions change
  useEffect(() => {
    if (suggestions.length === 0) {
      setHighlightIndex(-1)
    } else if (highlightIndex >= suggestions.length) {
      setHighlightIndex(suggestions.length - 1)
    }
    // update refs array length
    itemsRef.current = itemsRef.current.slice(0, suggestions.length)
  }, [suggestions, highlightIndex])

  // scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && itemsRef.current[highlightIndex]) {
      try {
        itemsRef.current[highlightIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      } catch {
        // ignore scroll errors
      }
    }
  }, [highlightIndex])

  const handleNavigate = (path) => {
    onOpenChange(false)
    navigate(path)
  }

  const handleMetadataOpen = (id) => {
    onOpenChange(false)
    try {
      const url = `${API_ENDPOINTS.PYGEOAPI.BASE}${API_ENDPOINTS.PYGEOAPI.METADATA_ITEM_BY_ID(id, API_ENDPOINTS.PYGEOAPI.DEFAULT_COLLECTION)}`
      window.open(url, '_blank')
    } catch (err) {
      console.error('Failed to open metadata page', err)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((prev) => (suggestions.length === 0 ? -1 : (prev + 1) % suggestions.length))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((prev) => (suggestions.length === 0 ? -1 : (prev - 1 + suggestions.length) % suggestions.length))
      return
    }
    if (e.key === 'Enter') {
      if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
        const s = suggestions[highlightIndex]
        if (s.type === 'metadata') {
          handleMetadataOpen(s.id)
        } else {
          handleNavigate(s.path)
        }
      } else if (suggestions.length > 0) {
        const s = suggestions[0]
        if (s.type === 'metadata') {
          handleMetadataOpen(s.id)
        } else {
          handleNavigate(s.path)
        }
      }
    }
    if (e.key === 'Escape') {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" /> Quick Search
          </DialogTitle>
          <DialogDescription>
            Press <kbd className="rounded border px-1">Enter</kbd> to go, <kbd className="rounded border px-1">Esc</kbd> to close.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <div className="mb-2">
            <div className="inline-flex items-center rounded-full bg-card border border-border p-1">
              <button
                onClick={() => setMode('routes')}
                aria-pressed={mode === 'routes'}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${mode === 'routes' ? 'bg-primary text-primary-foreground' : 'text-foreground/80'}`}
              >Navigation</button>
              <button
                onClick={() => setMode('metadata')}
                aria-pressed={mode === 'metadata'}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${mode === 'metadata' ? 'bg-primary text-primary-foreground' : 'text-foreground/80'}`}
              >Metadata</button>
            </div>
            {mode === 'metadata' && metadataLoading && (
              <Loader2 className="inline-block ml-2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          <Input
            ref={inputRef}
            placeholder={mode === 'metadata' ? 'Search metadata titles...' : 'Type to search navigation...'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          <div className="mt-3 max-h-64 overflow-auto" role="listbox" aria-activedescendant={highlightIndex >= 0 ? `qs-${highlightIndex}` : undefined}>
            {suggestions.length === 0 ? (
              <div className="text-sm text-muted-foreground p-2">No matches</div>
            ) : (
              suggestions.map((s, idx) => {
                const Icon = s.icon
                const isActive = idx === highlightIndex
                return (
                  <button
                    id={`qs-${idx}`}
                    key={s.path}
                    role="option"
                    aria-selected={isActive}
                    ref={(el) => itemsRef.current[idx] = el}
                    className={`w-full text-left p-2 rounded-md flex items-center gap-2 ${isActive ? 'bg-accent/50' : 'hover:bg-accent/40'}`}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    onMouseLeave={() => setHighlightIndex(-1)}
                    onClick={() => { if (s.type === 'metadata') { handleMetadataOpen(s.id) } else { handleNavigate(s.path) } }}
                  >
                    {Icon ? <Icon className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                    <span>{s.title}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{s.path ?? s.id}</span>
                  </button>
                )
              })
            )}
          </div>

          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default QuickSearch
