import { useState } from 'react'
import './index.css'
import Dashboard from './Dashboard'
import { DetailedReportView } from './DetailedReportView'
import { SAMPLE_NOTEBOOKLM_MARKDOWN } from './sampleReportMarkdown'

function App() {
  const [reportOpen, setReportOpen] = useState(false)

  return (
    <>
      <Dashboard />
      <button
        type="button"
        onClick={() => setReportOpen(true)}
        className="fixed bottom-5 right-5 z-[500] rounded-xl border border-[rgba(56,189,248,0.35)] bg-[rgba(8,13,23,0.92)] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#38bdf8] shadow-[0_0_24px_rgba(56,189,248,0.15)] backdrop-blur-md transition hover:border-[#a78bfa] hover:text-[#a78bfa]"
      >
        Notebook report
      </button>
      <DetailedReportView
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Traffic intelligence — detailed report"
        markdown={SAMPLE_NOTEBOOKLM_MARKDOWN}
        graphTitle="Corridor load (sample)"
        graphData={[
          { name: 'Jubilee', value: 92 },
          { name: 'Gachibowli', value: 88 },
          { name: 'Ameerpet', value: 71 },
          { name: 'Madhapur', value: 85 },
          { name: 'Tank Bund', value: 64 },
        ]}
        onExecuteInSandbox={(sql) => {
          void navigator.clipboard.writeText(sql).catch(() => {})
        }}
      />
    </>
  )
}

export default App
