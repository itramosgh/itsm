'use client'
import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'

interface Article {
  id: string
  title: string
  problem_description: string | null
  solution: string | null
}

interface KbSearchSuggestionsProps {
  query: string
  onResolved?: () => void
}

export function KbSearchSuggestions({ query, onResolved }: KbSearchSuggestionsProps) {
  const [articles, setArticles] = useState<Article[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (query.length < 3) return

    timerRef.current = setTimeout(async () => {
      const res = await fetch(`/api/kb/search?q=${encodeURIComponent(query)}`)
      const { articles: found } = await res.json()
      setArticles(found)
    }, 500)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  if (resolved) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        Ficamos felizes que conseguiu resolver! Seu chamado não foi aberto.
      </div>
    )
  }

  if (query.length < 3 || articles.length === 0) return null

  return (
    <div className="rounded-md border p-4 space-y-3">
      <p className="text-sm font-medium text-muted-foreground">
        Encontramos artigos que podem resolver seu problema:
      </p>
      {articles.map(a => (
        <div key={a.id} className="border rounded-md p-3 space-y-2">
          <button
            type="button"
            onClick={() => setExpanded(expanded === a.id ? null : a.id)}
            className="text-left font-medium text-sm hover:underline w-full"
          >
            {a.title}
          </button>
          {expanded === a.id && a.solution && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.solution}</p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => { setResolved(true); onResolved?.() }}
            >
              Isso resolveu meu problema
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setArticles(prev => prev.filter(x => x.id !== a.id))}
            >
              Ignorar
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
