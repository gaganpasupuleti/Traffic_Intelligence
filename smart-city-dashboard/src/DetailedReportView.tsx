import {
  useCallback,
  useEffect,
  useMemo,
  isValidElement,
  type ReactNode,
} from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

// ─── Graph (Recharts) ─────────────────────────────────────────────────────

export type GraphDatum = { name: string; value: number }

export type GraphSectionProps = {
  title?: string
  data: GraphDatum[]
  /** Bar fill; Antigravity accent default */
  accent?: string
}

export function GraphSection({
  title = 'Metrics overview',
  data,
  accent = '#38bdf8',
}: GraphSectionProps) {
  return (
    <section
      className="mt-10 rounded-2xl border border-[rgba(244,244,245,0.12)] bg-[#050506] p-5 shadow-[0_0_40px_rgba(56,189,248,0.08)]"
      aria-label={title}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="m-0 text-sm font-semibold uppercase tracking-[0.12em] text-[#f4f4f5]">
          {title}
        </h2>
        <span className="font-mono text-[10px] text-[#a1a1aa]">Recharts</span>
      </div>
      {data.length === 0 ? (
        <p className="m-0 py-8 text-center text-sm text-[#a1a1aa]">
          No graph data — pass <code className="text-[#38bdf8]">graphData</code> to{' '}
          <code className="text-[#a78bfa]">DetailedReportView</code>.
        </p>
      ) : (
        <div className="h-[280px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid
                stroke="rgba(244,244,245,0.06)"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{ fill: '#a1a1aa', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(244,244,245,0.12)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#a1a1aa', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: '#0b0b0d',
                  border: '1px solid rgba(56,189,248,0.25)',
                  borderRadius: 10,
                  color: '#f4f4f5',
                }}
                labelStyle={{ color: '#a1a1aa' }}
                cursor={{ fill: 'rgba(56,189,248,0.06)' }}
              />
              <Bar dataKey="value" fill={accent} radius={[6, 6, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

// ─── SQL block + Sandbox ────────────────────────────────────────────────────

type SqlCodeBlockProps = {
  code: string
  onExecuteInSandbox?: (sql: string) => void
}

function SqlCodeBlock({ code, onExecuteInSandbox }: SqlCodeBlockProps) {
  const handleClick = useCallback(() => {
    if (onExecuteInSandbox) {
      onExecuteInSandbox(code)
      return
    }
    void navigator.clipboard.writeText(code).catch(() => {})
    window.open(
      'https://console.cloud.google.com/bigquery',
      '_blank',
      'noopener,noreferrer',
    )
  }, [code, onExecuteInSandbox])

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-[rgba(56,189,248,0.28)] bg-[#030304] shadow-[0_0_32px_rgba(56,189,248,0.12)]">
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(244,244,245,0.08)] bg-[rgba(56,189,248,0.06)] px-3 py-2">
        <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-[#38bdf8]">
          SQL
        </span>
        <button
          type="button"
          onClick={handleClick}
          className="cursor-pointer rounded-lg border border-[rgba(167,139,250,0.45)] bg-[rgba(167,139,250,0.12)] px-3 py-1.5 text-xs font-semibold text-[#e9d5ff] transition hover:bg-[rgba(167,139,250,0.22)] hover:shadow-[0_0_20px_rgba(167,139,250,0.2)]"
        >
          Execute in Sandbox
        </button>
      </div>
      <pre className="report-markdown-pre !m-0 max-h-[320px] overflow-auto !rounded-none !border-0 !bg-transparent">
        <code className="block whitespace-pre text-[#f4f4f5]">{code}</code>
      </pre>
    </div>
  )
}

// ─── Full-page report overlay ──────────────────────────────────────────────

export type DetailedReportViewProps = {
  open: boolean
  onClose: () => void
  /** NotebookLM / report body (Markdown + GFM tables, lists, etc.) */
  markdown: string
  /** Optional header shown above the document */
  title?: string
  /** Recharts series for GraphSection */
  graphData?: GraphDatum[]
  graphTitle?: string
  graphAccent?: string
  /** Called when user clicks “Execute in Sandbox” on ```sql blocks */
  onExecuteInSandbox?: (sql: string) => void
}

export function DetailedReportView({
  open,
  onClose,
  markdown,
  title = 'Intelligence report',
  graphData = [],
  graphTitle = 'Signal strength by corridor',
  graphAccent,
  onExecuteInSandbox,
}: DetailedReportViewProps) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const markdownComponents: Components = useMemo(() => {
    const PreBlock: Components['pre'] = ({ children }) => {
      if (!isValidElement(children)) {
        return <pre className="report-markdown-pre">{children}</pre>
      }
      const props = children.props as {
        className?: string
        children?: ReactNode
      }
      const cls = props.className ?? ''
      if (cls.includes('language-sql')) {
        const raw = String(props.children ?? '').replace(/\n$/, '')
        return (
          <SqlCodeBlock code={raw} onExecuteInSandbox={onExecuteInSandbox} />
        )
      }
      return <pre className="report-markdown-pre">{children}</pre>
    }

    return {
      pre: PreBlock,
    }
  }, [onExecuteInSandbox])

  if (!open) return null

  return (
    <div
      className="report-overlay-root fixed inset-0 z-[1000] flex items-stretch justify-center bg-[rgba(2,3,6,0.92)] backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detailed-report-title"
    >
      {/* Side rails — Antigravity floating chrome */}
      <aside
        className="report-rail report-rail--left relative hidden shrink-0 self-stretch md:block"
        aria-hidden
      >
        <div className="report-rail__glow" />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col px-3 py-4 sm:px-5">
        <header className="mb-3 flex shrink-0 items-center justify-between gap-3">
          <h1
            id="detailed-report-title"
            className="m-0 bg-gradient-to-r from-[#38bdf8] to-[#a78bfa] bg-clip-text text-lg font-extrabold tracking-tight text-transparent sm:text-xl"
          >
            {title}
          </h1>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[rgba(244,244,245,0.2)] bg-[rgba(15,15,18,0.9)] px-4 py-2 text-sm font-semibold text-[#f4f4f5] transition hover:border-[#38bdf8] hover:text-[#38bdf8]"
          >
            Close
          </button>
        </header>

        {/* Solid high-contrast document column */}
        <div
          className="report-markdown-doc min-h-0 flex-1 overflow-y-auto rounded-2xl border border-[rgba(244,244,245,0.14)] bg-[#0b0b0d] px-4 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:px-8 sm:py-8"
          style={{
            color: '#f4f4f5',
            boxShadow:
              '0 24px 80px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(56,189,248,0.06)',
          }}
        >
          <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {markdown}
          </Markdown>

          <GraphSection
            title={graphTitle}
            data={graphData}
            accent={graphAccent}
          />
        </div>
      </div>

      <aside
        className="report-rail report-rail--right relative hidden shrink-0 self-stretch md:block"
        aria-hidden
      >
        <div className="report-rail__glow" />
      </aside>
    </div>
  )
}

export default DetailedReportView
