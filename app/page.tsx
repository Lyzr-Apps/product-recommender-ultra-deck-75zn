'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent, type AIAgentResponse } from '@/lib/aiAgent'
import { KnowledgeBaseUpload } from '@/components/KnowledgeBaseUpload'
import { AgentActivityPanel } from '@/components/AgentActivityPanel'
import { useLyzrAgentEvents } from '@/lib/lyzrAgentEvents'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  FiSend,
  FiPlus,
  FiMessageSquare,
  FiMenu,
  FiX,
  FiPackage,
  FiUploadCloud,
  FiDollarSign,
  FiStar,
  FiCheck,
  FiChevronRight,
  FiDatabase,
  FiAlertCircle,
  FiRefreshCw,
  FiActivity,
} from 'react-icons/fi'

// ─── Constants ───────────────────────────────────────────────────────────────
const AGENT_ID = '6994bceb277b422741401d41'
const RAG_ID = '6994bcd17049059138dd20e5'
const LOCAL_STORAGE_KEY = 'productpal_conversations'

// ─── Interfaces ──────────────────────────────────────────────────────────────
interface Product {
  name: string
  description: string
  features: string[]
  price: string
  rationale: string
}

interface ComparisonProduct {
  name: string
  values: string[]
}

interface Comparison {
  attributes: string[]
  products: ComparisonProduct[]
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  products?: Product[]
  comparison?: Comparison | null
  timestamp: string
  error?: boolean
}

interface Conversation {
  id: string
  sessionId: string
  title: string
  messages: Message[]
  createdAt: string
  updatedAt: string
}

// ─── Sample Data ─────────────────────────────────────────────────────────────
const SAMPLE_CONVERSATIONS: Conversation[] = [
  {
    id: 'sample-1',
    sessionId: 'sample-session-1',
    title: 'CRM for small team',
    messages: [
      {
        id: 'sm-1',
        role: 'user',
        content: 'I need a CRM for a small team of 5 people.',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'sm-2',
        role: 'assistant',
        content: 'Based on your team size and needs, here are my top CRM recommendations that balance functionality with ease of use for small teams.',
        products: [
          {
            name: 'HubSpot CRM',
            description: 'Free CRM with powerful marketing and sales tools built-in.',
            features: ['Contact management', 'Email tracking', 'Pipeline view', 'Free tier'],
            price: 'Free - $45/mo',
            rationale: 'Perfect for small teams starting out with CRM. The free tier is generous and covers most needs.',
          },
          {
            name: 'Pipedrive',
            description: 'Sales-focused CRM with an intuitive visual pipeline interface.',
            features: ['Visual pipeline', 'Activity reminders', 'Mobile app', 'Automation'],
            price: '$14.90/user/mo',
            rationale: 'Great for teams that want a simple, sales-focused tool without the complexity of larger CRMs.',
          },
        ],
        comparison: {
          attributes: ['Price', 'Ease of Use', 'Integrations', 'Mobile App', 'Support'],
          products: [
            { name: 'HubSpot CRM', values: ['Free - $45/mo', 'Excellent', '500+', 'Yes', 'Community + Paid'] },
            { name: 'Pipedrive', values: ['$14.90/user/mo', 'Very Good', '300+', 'Yes', 'Email + Chat'] },
          ],
        },
        timestamp: new Date(Date.now() - 3500000).toISOString(),
      },
    ],
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3500000).toISOString(),
  },
]

const SUGGESTED_PROMPTS = [
  'Find me a project management tool',
  'Compare your premium plans',
  "What's best for a startup?",
  'I need a CRM for a small team',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 10)
}

function relativeTime(dateString: string): string {
  try {
    const now = Date.now()
    const date = new Date(dateString).getTime()
    const diff = now - date
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(dateString).toLocaleDateString()
  } catch {
    return ''
  }
}

function parseAgentResponse(result: AIAgentResponse): { text: string; products: Product[]; comparison: Comparison | null } {
  let text = ''
  let products: Product[] = []
  let comparison: Comparison | null = null

  try {
    if (!result || !result.success || !result.response) {
      return { text: result?.error || 'Sorry, I encountered an error. Please try again.', products, comparison }
    }

    const response = result.response
    let raw = response.result
    let parsed: any = null

    // If raw is already an object, use it directly
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      parsed = raw
    } else if (typeof raw === 'string') {
      // Try to parse JSON string
      try {
        parsed = JSON.parse(raw)
      } catch {
        // It's just plain text
        text = raw
      }
    }

    // Extract structured data from parsed object
    if (parsed && typeof parsed === 'object') {
      // Try to get text response from various possible keys
      text = typeof parsed.response === 'string' ? parsed.response : ''
      if (!text) text = typeof parsed.text === 'string' ? parsed.text : ''
      if (!text) text = typeof parsed.message === 'string' ? parsed.message : ''
      if (!text) text = typeof parsed.answer === 'string' ? parsed.answer : ''
      if (!text) text = typeof parsed.content === 'string' ? parsed.content : ''

      products = Array.isArray(parsed.products)
        ? parsed.products.filter((p: any) => p && typeof p.name === 'string')
        : []
      comparison =
        parsed.comparison &&
        typeof parsed.comparison === 'object' &&
        !Array.isArray(parsed.comparison) &&
        Array.isArray(parsed.comparison?.attributes)
          ? parsed.comparison
          : null
    }

    // Fallback: try response.message
    if (!text) {
      text = response.message || ''
    }

    // Fallback: try to get text from raw_response
    if (!text && result.raw_response) {
      try {
        const rawParsed = JSON.parse(result.raw_response)
        if (typeof rawParsed === 'string') {
          text = rawParsed
        } else if (rawParsed?.response && typeof rawParsed.response === 'string') {
          text = rawParsed.response
        } else if (rawParsed?.response?.result) {
          const innerResult = rawParsed.response.result
          if (typeof innerResult === 'string') {
            text = innerResult
          } else if (typeof innerResult === 'object') {
            text = innerResult.response || innerResult.text || innerResult.message || ''
            if (!products.length && Array.isArray(innerResult.products)) {
              products = innerResult.products.filter((p: any) => p && typeof p.name === 'string')
            }
            if (!comparison && innerResult.comparison && typeof innerResult.comparison === 'object' && Array.isArray(innerResult.comparison?.attributes)) {
              comparison = innerResult.comparison
            }
          }
        }
      } catch {
        // raw_response is not JSON
        if (typeof result.raw_response === 'string' && result.raw_response.length > 0) {
          text = result.raw_response
        }
      }
    }

    // Final fallback
    if (!text) {
      text = "I received your message but couldn't format a response. Please try again."
    }
  } catch (err) {
    console.error('parseAgentResponse error:', err)
    text = "Sorry, I encountered an error processing the response. Please try again."
  }

  return { text, products, comparison }
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return (
            <h4 key={i} className="font-semibold text-sm mt-3 mb-1">
              {line.slice(4)}
            </h4>
          )
        if (line.startsWith('## '))
          return (
            <h3 key={i} className="font-semibold text-base mt-3 mb-1">
              {line.slice(3)}
            </h3>
          )
        if (line.startsWith('# '))
          return (
            <h2 key={i} className="font-bold text-lg mt-4 mb-2">
              {line.slice(2)}
            </h2>
          )
        if (line.startsWith('- ') || line.startsWith('* '))
          return (
            <li key={i} className="ml-4 list-disc text-sm leading-relaxed">
              {formatInline(line.slice(2))}
            </li>
          )
        if (/^\d+\.\s/.test(line))
          return (
            <li key={i} className="ml-4 list-decimal text-sm leading-relaxed">
              {formatInline(line.replace(/^\d+\.\s/, ''))}
            </li>
          )
        if (!line.trim()) return <div key={i} className="h-1" />
        return (
          <p key={i} className="text-sm leading-relaxed">
            {formatInline(line)}
          </p>
        )
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">
        {part}
      </strong>
    ) : (
      part
    )
  )
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
        <FiPackage className="w-4 h-4 text-primary" />
      </div>
      <div className="bg-card rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-border/30">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" />
          <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0.15s' }} />
          <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0.3s' }} />
        </div>
      </div>
    </div>
  )
}

function ProductCard({ product }: { product: Product }) {
  const features = Array.isArray(product?.features) ? product.features : []
  return (
    <div className="bg-card border border-border/30 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-serif font-semibold text-base tracking-wide text-card-foreground">
            {product?.name ?? 'Unnamed Product'}
          </h4>
          {product?.price && (
            <span className="flex-shrink-0 inline-flex items-center gap-1 text-sm font-medium text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
              <FiDollarSign className="w-3.5 h-3.5" />
              {product.price}
            </span>
          )}
        </div>
        {product?.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{product.description}</p>
        )}
        {features.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {features.map((feature, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 text-xs font-medium bg-secondary text-secondary-foreground px-2.5 py-1 rounded-full"
              >
                <FiCheck className="w-3 h-3" />
                {feature}
              </span>
            ))}
          </div>
        )}
        {product?.rationale && (
          <div className="bg-accent/10 border border-accent/20 rounded-lg p-3 mt-2">
            <div className="flex items-center gap-1.5 mb-1">
              <FiStar className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-medium text-accent tracking-wide uppercase">Why this fits</span>
            </div>
            <p className="text-sm text-card-foreground leading-relaxed">{product.rationale}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ComparisonTable({ comparison }: { comparison: Comparison }) {
  const attributes = Array.isArray(comparison?.attributes) ? comparison.attributes : []
  const products = Array.isArray(comparison?.products) ? comparison.products : []

  if (attributes.length === 0 || products.length === 0) return null

  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-border/30 shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-secondary/60">
            <th className="text-left px-4 py-2.5 font-medium text-secondary-foreground tracking-wide text-xs uppercase border-b border-border/20">Attribute</th>
            {products.map((p, idx) => (
              <th key={idx} className="text-left px-4 py-2.5 font-semibold font-serif text-secondary-foreground border-b border-border/20">
                {p?.name ?? `Product ${idx + 1}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {attributes.map((attr, rowIdx) => (
            <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-card' : 'bg-muted/30'}>
              <td className="px-4 py-2.5 font-medium text-card-foreground border-b border-border/10">{attr}</td>
              {products.map((p, colIdx) => {
                const values = Array.isArray(p?.values) ? p.values : []
                return (
                  <td key={colIdx} className="px-4 py-2.5 text-muted-foreground border-b border-border/10">
                    {values[rowIdx] ?? '-'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const products = Array.isArray(message?.products) ? message.products : []
  const hasComparison = message?.comparison && typeof message.comparison === 'object' && Array.isArray(message.comparison?.attributes)

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] md:max-w-[70%]">
          <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 text-right">
            {relativeTime(message.timestamp)}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
        <FiPackage className="w-4 h-4 text-primary" />
      </div>
      <div className="max-w-[85%] md:max-w-[80%] space-y-3">
        {message.error ? (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl rounded-tl-sm px-4 py-3">
            <div className="flex items-center gap-2 text-destructive">
              <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
              <p className="text-sm">{message.content}</p>
            </div>
          </div>
        ) : (
          <div className="bg-card rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-border/30">
            {renderMarkdown(message.content)}
          </div>
        )}

        {products.length > 0 && (
          <div className={cn('grid gap-3', products.length >= 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1')}>
            {products.map((product, idx) => (
              <ProductCard key={idx} product={product} />
            ))}
          </div>
        )}

        {hasComparison && message.comparison && (
          <ComparisonTable comparison={message.comparison} />
        )}

        <p className="text-[10px] text-muted-foreground">
          {relativeTime(message.timestamp)}
        </p>
      </div>
    </div>
  )
}

function WelcomeScreen({ onPromptClick }: { onPromptClick: (prompt: string) => void }) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-lg w-full text-center space-y-8">
        <div className="space-y-3">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <FiPackage className="w-8 h-8 text-primary" />
          </div>
          <h2 className="font-serif text-2xl font-semibold tracking-wide text-foreground">
            Welcome to ProductPal
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            Your smart product recommendation assistant. Describe what you need and I will find the best match from our catalog.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SUGGESTED_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => onPromptClick(prompt)}
              className="group text-left bg-card hover:bg-secondary border border-border/30 hover:border-primary/30 rounded-lg p-3.5 transition-all duration-200 shadow-sm hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-card-foreground group-hover:text-primary transition-colors">
                  {prompt}
                </span>
                <FiChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function CatalogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-background rounded-lg shadow-xl border border-border/30 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border/20">
          <div className="flex items-center gap-2">
            <FiDatabase className="w-5 h-5 text-primary" />
            <h3 className="font-serif font-semibold text-lg tracking-wide">Product Catalog</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
            <FiX className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        <div className="p-4 max-h-[70vh] overflow-y-auto">
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Upload your product catalog documents (PDF, DOCX, TXT) to enhance recommendations.
          </p>
          <KnowledgeBaseUpload ragId={RAG_ID} />
        </div>
      </div>
    </div>
  )
}

function AgentStatusBar({ isLoading, activeAgentId }: { isLoading: boolean; activeAgentId: string | null }) {
  return (
    <div className="bg-card border border-border/20 rounded-lg p-3 mt-auto">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FiActivity className="w-3.5 h-3.5" />
        <span className="font-medium">Agent:</span>
        <span className="truncate">Product Recommendation Agent</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className={cn('w-2 h-2 rounded-full', isLoading ? 'bg-accent animate-pulse' : activeAgentId ? 'bg-green-500' : 'bg-muted-foreground/40')} />
          <span>{isLoading ? 'Processing' : 'Ready'}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function Page() {
  // ── State ────────────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showCatalogModal, setShowCatalogModal] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [sampleDataOn, setSampleDataOn] = useState(false)
  const [showActivityPanel, setShowActivityPanel] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Derive active conversation
  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null

  // Agent activity monitoring
  const agentActivity = useLyzrAgentEvents(activeConversation?.sessionId ?? null)
  const agentActivityRef = useRef(agentActivity)
  useEffect(() => {
    agentActivityRef.current = agentActivity
  }, [agentActivity])

  // ── Effects ──────────────────────────────────────────────────────────────

  // Check desktop on mount
  useEffect(() => {
    const checkDesktop = () => {
      const desk = window.innerWidth >= 768
      setIsDesktop(desk)
      if (desk) setSidebarOpen(true)
    }
    checkDesktop()
    window.addEventListener('resize', checkDesktop)
    return () => window.removeEventListener('resize', checkDesktop)
  }, [])

  // Load conversations from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setConversations(parsed)
          setActiveConversationId(parsed[0].id)
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [])

  // Save conversations to localStorage
  useEffect(() => {
    if (conversations.length > 0 && !sampleDataOn) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(conversations))
      } catch {
        // Ignore storage errors
      }
    }
  }, [conversations, sampleDataOn])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConversation?.messages?.length, isLoading])

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 160) + 'px'
    }
  }, [])

  useEffect(() => {
    adjustTextareaHeight()
  }, [inputValue, adjustTextareaHeight])

  // Sample data toggle
  useEffect(() => {
    if (sampleDataOn) {
      setConversations(SAMPLE_CONVERSATIONS)
      setActiveConversationId(SAMPLE_CONVERSATIONS[0].id)
    } else {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed)) {
            setConversations(parsed)
            setActiveConversationId(parsed.length > 0 ? parsed[0].id : null)
            return
          }
        }
      } catch {
        // Ignore
      }
      setConversations([])
      setActiveConversationId(null)
    }
  }, [sampleDataOn])

  // ── Actions ──────────────────────────────────────────────────────────────

  const createNewConversation = useCallback(() => {
    const newConv: Conversation = {
      id: generateId(),
      sessionId: generateId(),
      title: 'New Conversation',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setConversations((prev) => [newConv, ...prev])
    setActiveConversationId(newConv.id)
    setInputValue('')
    try { agentActivityRef.current.reset() } catch {}
    if (!isDesktop) setSidebarOpen(false)
  }, [isDesktop])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isLoading) return

      let convId = activeConversationId
      let sessionId = activeConversation?.sessionId ?? generateId()

      // Create new conversation if none
      if (!convId) {
        const newConv: Conversation = {
          id: generateId(),
          sessionId: generateId(),
          title: trimmed.slice(0, 50),
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        sessionId = newConv.sessionId
        convId = newConv.id
        setConversations((prev) => [newConv, ...prev])
        setActiveConversationId(newConv.id)
      }

      // Add user message
      const userMsg: Message = {
        id: generateId(),
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      }

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== convId) return c
          const isFirst = c.messages.length === 0
          return {
            ...c,
            title: isFirst ? trimmed.slice(0, 50) : c.title,
            messages: [...c.messages, userMsg],
            updatedAt: new Date().toISOString(),
          }
        })
      )
      setInputValue('')
      setIsLoading(true)
      try { agentActivityRef.current.setProcessing(true) } catch {}

      try {
        console.log('[ProductPal] Calling agent with:', { message: trimmed, agent_id: AGENT_ID, session_id: sessionId })
        const result = await callAIAgent(trimmed, AGENT_ID, { session_id: sessionId })
        console.log('[ProductPal] Agent response:', JSON.stringify(result).substring(0, 500))
        const { text: agentText, products, comparison } = parseAgentResponse(result)

        const assistantMsg: Message = {
          id: generateId(),
          role: 'assistant',
          content: agentText,
          products: products.length > 0 ? products : undefined,
          comparison: comparison ?? undefined,
          timestamp: new Date().toISOString(),
        }

        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c
            return {
              ...c,
              messages: [...c.messages, assistantMsg],
              updatedAt: new Date().toISOString(),
            }
          })
        )
      } catch (err) {
        console.error('[ProductPal] Agent call error:', err)
        const errorMsg: Message = {
          id: generateId(),
          role: 'assistant',
          content: 'Something went wrong. Please try again.',
          timestamp: new Date().toISOString(),
          error: true,
        }
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c
            return {
              ...c,
              messages: [...c.messages, errorMsg],
              updatedAt: new Date().toISOString(),
            }
          })
        )
      } finally {
        setIsLoading(false)
        try { agentActivityRef.current.setProcessing(false) } catch {}
      }
    },
    [activeConversationId, activeConversation?.sessionId, isLoading]
  )

  const retryLastMessage = useCallback(() => {
    if (!activeConversation) return
    const msgs = activeConversation.messages
    if (msgs.length < 2) return
    const lastUserMsg = [...msgs].reverse().find((m) => m.role === 'user')
    if (lastUserMsg) {
      // Remove error message
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== activeConversationId) return c
          const filtered = c.messages.filter((m) => !m.error)
          return { ...c, messages: filtered }
        })
      )
      sendMessage(lastUserMsg.content)
    }
  }, [activeConversation, activeConversationId, sendMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage(inputValue)
      }
    },
    [inputValue, sendMessage]
  )

  const messages = Array.isArray(activeConversation?.messages) ? activeConversation.messages : []
  const hasMessages = messages.length > 0

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* ── Sidebar Overlay (mobile) ────────────────────────────────────── */}
      {sidebarOpen && !isDesktop && (
        <div className="fixed inset-0 z-30 bg-foreground/30 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className={cn(
          'flex flex-col z-40 h-full border-r border-border/20 transition-all duration-300 bg-[hsl(35,25%,90%)]',
          sidebarOpen ? 'w-80' : 'w-0',
          !isDesktop && sidebarOpen && 'fixed left-0 top-0 bottom-0',
          !sidebarOpen && 'overflow-hidden'
        )}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between p-4 border-b border-border/20">
          <div className="flex items-center gap-2">
            <FiPackage className="w-5 h-5 text-primary" />
            <h1 className="font-serif text-lg font-semibold tracking-wide text-foreground">ProductPal</h1>
          </div>
          {!isDesktop && (
            <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-md hover:bg-muted transition-colors">
              <FiX className="w-5 h-5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* New Conversation button */}
        <div className="p-3">
          <Button onClick={createNewConversation} variant="outline" className="w-full justify-start gap-2 text-sm font-medium border-border/40 hover:bg-secondary">
            <FiPlus className="w-4 h-4" />
            New Conversation
          </Button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          {conversations.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8 px-4">
              No conversations yet. Start chatting to create one.
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === activeConversationId
              const preview = Array.isArray(conv.messages) && conv.messages.length > 0 ? conv.messages[0].content : 'Empty conversation'
              return (
                <button
                  key={conv.id}
                  onClick={() => {
                    setActiveConversationId(conv.id)
                    try { agentActivityRef.current.reset() } catch {}
                    if (!isDesktop) setSidebarOpen(false)
                  }}
                  className={cn(
                    'w-full text-left rounded-lg px-3 py-2.5 transition-colors duration-150',
                    isActive ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/60 border border-transparent'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <FiMessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-medium truncate text-foreground">{conv.title}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1 ml-5.5">
                    <span className="text-xs text-muted-foreground truncate max-w-[160px]">{preview}</span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-2">
                      {relativeTime(conv.updatedAt)}
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Sidebar footer: catalog + agent status */}
        <div className="p-3 space-y-2 border-t border-border/20">
          <button
            onClick={() => setShowCatalogModal(true)}
            className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg hover:bg-muted/60 transition-colors"
          >
            <FiUploadCloud className="w-4 h-4" />
            <span className="font-medium">Manage Product Catalog</span>
          </button>
          <AgentStatusBar isLoading={isLoading} activeAgentId={agentActivity.activeAgentId} />
        </div>
      </aside>

      {/* ── Main Chat Area ──────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border/20 bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                <FiMenu className="w-5 h-5 text-muted-foreground" />
              </button>
            )}
            {isDesktop && sidebarOpen && (
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                <FiMenu className="w-5 h-5 text-muted-foreground" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <FiPackage className="w-5 h-5 text-primary" />
              <h2 className="font-serif font-semibold text-base tracking-wide text-foreground">ProductPal</h2>
              <div className="flex items-center gap-1.5 ml-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs text-muted-foreground">Online</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Agent Activity toggle */}
            <button
              onClick={() => setShowActivityPanel(!showActivityPanel)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                showActivityPanel ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'
              )}
            >
              <FiActivity className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Activity</span>
              {agentActivity.isProcessing && (
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              )}
            </button>

            {/* Sample Data toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">Sample Data</span>
              <button
                onClick={() => setSampleDataOn(!sampleDataOn)}
                className={cn(
                  'relative w-10 h-5 rounded-full transition-colors duration-200',
                  sampleDataOn ? 'bg-primary' : 'bg-muted'
                )}
              >
                <div
                  className={cn(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200',
                    sampleDataOn ? 'translate-x-5' : 'translate-x-0.5'
                  )}
                />
              </button>
            </div>
          </div>
        </header>

        {/* Chat content area */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Messages */}
          <div className="flex-1 flex flex-col min-w-0">
            {!hasMessages ? (
              <WelcomeScreen onPromptClick={(prompt) => sendMessage(prompt)} />
            ) : (
              <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                {isLoading && <TypingIndicator />}
                {/* Error retry */}
                {!isLoading && messages.length > 0 && messages[messages.length - 1]?.error && (
                  <div className="flex items-center gap-2 ml-11">
                    <Button variant="outline" size="sm" onClick={retryLastMessage} className="text-xs gap-1.5">
                      <FiRefreshCw className="w-3 h-3" />
                      Retry
                    </Button>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Input bar */}
            <div className="border-t border-border/20 bg-card/50 backdrop-blur-sm p-4">
              <div className="max-w-3xl mx-auto flex items-end gap-3">
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe what you're looking for..."
                    rows={1}
                    disabled={isLoading}
                    className="w-full resize-none rounded-lg border border-border/40 bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 leading-relaxed"
                  />
                </div>
                <Button
                  onClick={() => sendMessage(inputValue)}
                  disabled={isLoading || !inputValue.trim()}
                  className="h-[46px] w-[46px] rounded-lg flex-shrink-0"
                >
                  {isLoading ? (
                    <FiRefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <FiSend className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                Press Enter to send, Shift+Enter for new line
              </p>
            </div>
          </div>

          {/* Agent Activity Panel (side panel) */}
          {showActivityPanel && (
            <div className="hidden md:flex w-80 border-l border-border/20 flex-shrink-0">
              <AgentActivityPanel
                isConnected={agentActivity.isConnected}
                events={agentActivity.events}
                thinkingEvents={agentActivity.thinkingEvents}
                lastThinkingMessage={agentActivity.lastThinkingMessage}
                activeAgentId={agentActivity.activeAgentId}
                activeAgentName={agentActivity.activeAgentName}
                isProcessing={agentActivity.isProcessing}
                className="w-full rounded-none border-0"
              />
            </div>
          )}
        </div>
      </main>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      <CatalogModal open={showCatalogModal} onClose={() => setShowCatalogModal(false)} />

      {/* Mobile Agent Activity Panel (bottom sheet) */}
      {showActivityPanel && !isDesktop && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={() => setShowActivityPanel(false)} />
          <div className="relative bg-background rounded-t-xl shadow-xl max-h-[60vh] flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-border/20">
              <span className="text-sm font-medium">Agent Activity</span>
              <button onClick={() => setShowActivityPanel(false)} className="p-1 rounded-md hover:bg-muted">
                <FiX className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AgentActivityPanel
                isConnected={agentActivity.isConnected}
                events={agentActivity.events}
                thinkingEvents={agentActivity.thinkingEvents}
                lastThinkingMessage={agentActivity.lastThinkingMessage}
                activeAgentId={agentActivity.activeAgentId}
                activeAgentName={agentActivity.activeAgentName}
                isProcessing={agentActivity.isProcessing}
                className="rounded-none border-0 shadow-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
