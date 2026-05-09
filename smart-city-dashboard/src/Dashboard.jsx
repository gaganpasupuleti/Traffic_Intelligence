import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from 'recharts'

// ─── Constants ──────────────────────────────────────────────────────────────
const API_BASE = 'http://localhost:8000'
const POLL_INTERVAL = 2000

// ─── Weather icon mapping ────────────────────────────────────────────────────
const WEATHER_ICONS = {
  Clear: '☀️', Cloudy: '☁️', 'Light Rain': '🌦️',
  'Heavy Rain': '⛈️', Fog: '🌫️', Drizzle: '🌧️',
}

const WEATHER_COLORS = {
  Clear: '#fbbf24', Cloudy: '#94a3b8', 'Light Rain': '#60a5fa',
  'Heavy Rain': '#818cf8', Fog: '#a3a3a3', Drizzle: '#7dd3fc',
}

// ─── Custom tooltip for the chart ────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div style={{
      background: 'rgba(8,13,23,0.95)',
      border: '1px solid rgba(56,189,248,0.3)',
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 12,
      color: '#e8f4fd',
      backdropFilter: 'blur(8px)',
    }}>
      <p style={{ color: '#7ea3c4', marginBottom: 4 }}>{label}</p>
      <p style={{ color: '#38bdf8', fontWeight: 700, fontSize: 16, margin: 0 }}>
        {Math.round(d?.predicted_vehicle_count ?? 0)} <span style={{ fontWeight: 400, fontSize: 12 }}>vehicles</span>
      </p>
      {d?.weather_condition && (
        <p style={{ margin: '4px 0 0', color: WEATHER_COLORS[d.weather_condition] ?? '#94a3b8' }}>
          {WEATHER_ICONS[d.weather_condition] ?? '🌐'} {d.weather_condition}
        </p>
      )}
    </div>
  )
}

// ─── Status card ─────────────────────────────────────────────────────────────
function StatusCard({ label, value, icon, color, sub }) {
  return (
    <div className="glass-card animate-fade-up" style={{
      padding: '20px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minHeight: 120,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {label}
        </span>
      </div>
      <div style={{
        fontSize: 22, fontWeight: 700,
        color: color ?? 'var(--text-primary)',
        lineHeight: 1.2,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {value ?? '—'}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

// ─── Big metric card ─────────────────────────────────────────────────────────
function MetricCard({ label, value, unit, color, glow }) {
  return (
    <div className="glass-card animate-fade-up" style={{
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      boxShadow: glow,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        {label}
      </div>
      <div className="shimmer" style={{ fontSize: 44, fontWeight: 800 }}>
        {value ?? '—'}
      </div>
      {unit && <div style={{ fontSize: 12, color: color ?? 'var(--text-muted)' }}>{unit}</div>}
    </div>
  )
}

// ─── Prediction row in table ──────────────────────────────────────────────────
function PredRow({ item, idx }) {
  const diff = item.predicted_vehicle_count - item.actual_vehicle_count
  const diffColor = Math.abs(diff) < 10 ? '#34d399' : Math.abs(diff) < 20 ? '#fbbf24' : '#f87171'
  return (
    <tr style={{
      borderBottom: '1px solid rgba(99,179,237,0.06)',
      transition: 'background 0.2s',
      animation: `fade-up 0.3s ease ${idx * 0.03}s both`,
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(56,189,248,0.05)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
        {item.timestamp?.slice(11, 19) ?? '—'}
      </td>
      <td style={{ padding: '10px 14px', fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.intersection_name}
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>
        {Math.round(item.predicted_vehicle_count)}
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-muted)' }}>
        {item.actual_vehicle_count}
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'right', color: diffColor, fontWeight: 600 }}>
        {diff > 0 ? '+' : ''}{Math.round(diff)}
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 16 }}>
        {WEATHER_ICONS[item.weather_condition] ?? '🌐'}
      </td>
    </tr>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [predictions, setPredictions] = useState([])
  const [latest, setLatest] = useState(null)
  const [connected, setConnected] = useState(false)
  const [lastFetch, setLastFetch] = useState(null)
  const [error, setError] = useState(null)
  const intervalRef = useRef(null)

  const fetchData = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/latest-traffic`, { timeout: 3000 })
      const preds = data.predictions ?? []
      setPredictions(preds)
      if (preds.length > 0) setLatest(preds[preds.length - 1])
      setConnected(true)
      setError(null)
      setLastFetch(new Date())
    } catch (err) {
      setConnected(false)
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    fetchData()
    intervalRef.current = setInterval(fetchData, POLL_INTERVAL)
    return () => clearInterval(intervalRef.current)
  }, [fetchData])

  // Chart data — last 30 points for readability
  const chartData = predictions.slice(-30).map((p, i) => ({
    ...p,
    label: p.timestamp?.slice(11, 19) ?? String(i),
    predicted_vehicle_count: Math.round(p.predicted_vehicle_count),
  }))

  const avgPredicted = predictions.length
    ? Math.round(predictions.reduce((a, b) => a + b.predicted_vehicle_count, 0) / predictions.length)
    : null

  const avgSpeed = predictions.length
    ? (predictions.reduce((a, b) => a + b.average_speed_kmh, 0) / predictions.length).toFixed(1)
    : null

  const maxVehicles = predictions.length
    ? Math.round(Math.max(...predictions.map(p => p.predicted_vehicle_count)))
    : null

  // ─── Background grid ─────────────────────────────────────────────────────
  const gridBg = {
    backgroundImage: `
      linear-gradient(rgba(56,189,248,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(56,189,248,0.04) 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px',
  }

  return (
    <div style={{ minHeight: '100vh', ...gridBg, padding: '0 0 40px' }}>

      {/* ── Top gradient strip ── */}
      <div style={{
        height: 3,
        background: 'linear-gradient(90deg, #38bdf8, #a78bfa, #34d399)',
      }} />

      {/* ── Header ── */}
      <header style={{
        padding: '24px 40px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
        background: 'rgba(8,13,23,0.8)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Logo/icon */}
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #38bdf8, #a78bfa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, boxShadow: '0 0 20px rgba(56,189,248,0.4)',
          }}>🏙️</div>
          <div>
            <h1 className="gradient-text" style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
              Smart City Traffic Intelligence
            </h1>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              ML-Enabled IoT Traffic Prediction System · Hyderabad Urban Grid
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {/* Last updated */}
          {lastFetch && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
              Updated {lastFetch.toLocaleTimeString()}
            </span>
          )}
          {/* Live / offline badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20, border: '1px solid', borderColor: connected ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)', background: connected ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)' }}>
            <div className={connected ? 'live-dot' : ''} style={connected ? {} : { width: 10, height: 10, borderRadius: '50%', background: '#f87171', boxShadow: '0 0 8px #f87171' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: connected ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {connected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </header>

      <main style={{ padding: '32px 40px', maxWidth: 1600, margin: '0 auto' }}>

        {/* ── Error banner ── */}
        {error && (
          <div style={{
            marginBottom: 24, padding: '14px 20px', borderRadius: 12,
            background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
            color: '#f87171', fontSize: 13,
          }}>
            ⚠️ <strong>API Unreachable</strong> — Make sure <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4 }}>uvicorn realtime_api:app</code> is running on port 8000.
            <br /><span style={{ fontSize: 11, color: '#f87171aa', marginTop: 4, display: 'block' }}>{error}</span>
          </div>
        )}

        {/* ── KPI row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
          <MetricCard label="Avg Predicted Volume" value={avgPredicted} unit="vehicles / reading" color="var(--accent-cyan)" glow="var(--glow-cyan)" />
          <MetricCard label="Peak Volume Seen" value={maxVehicles} unit="vehicles (max)" color="var(--accent-amber)" glow="var(--glow-green)" />
          <MetricCard label="Avg Speed" value={avgSpeed} unit="km/h average" color="var(--accent-green)" glow="var(--glow-green)" />
          <MetricCard label="Predictions Stored" value={predictions.length || '—'} unit={`of ${50} max`} color="var(--accent-purple)" />
        </div>

        {/* ── Main chart ── */}
        <div className="glass-card" style={{ padding: '28px 28px 20px', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                Live Traffic Volume Forecast
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                RandomForest ML predictions · auto-refreshes every 2 s · last 30 data points
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 24, height: 2, background: '#38bdf8', borderRadius: 2, display: 'inline-block' }} />
                Predicted Count
              </span>
            </div>
          </div>

          {chartData.length === 0 ? (
            <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexDirection: 'column', gap: 12 }}>
              <span style={{ fontSize: 40 }}>📡</span>
              <span>Waiting for data from the API…</span>
              <span style={{ fontSize: 11 }}>Start <code>realtime_api.py</code> and <code>data_simulator.py</code></span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="cyanGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,179,237,0.08)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#7ea3c4', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                  axisLine={false} tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: '#7ea3c4', fontSize: 10 }}
                  axisLine={false} tickLine={false}
                  domain={['auto', 'auto']}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="predicted_vehicle_count"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  fill="url(#cyanGrad)"
                  dot={false}
                  activeDot={{ r: 6, fill: '#38bdf8', strokeWidth: 0, filter: 'drop-shadow(0 0 6px #38bdf8)' }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Status cards + table ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>

          {/* Left: status cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <StatusCard
              label="Latest Intersection"
              value={latest?.intersection_name ?? 'No data yet'}
              icon="📍"
              color="var(--accent-cyan)"
              sub={latest?.sensor_id ? `Sensor ${latest.sensor_id}` : undefined}
            />
            <StatusCard
              label="Weather Condition"
              value={latest?.weather_condition
                ? `${WEATHER_ICONS[latest.weather_condition] ?? ''} ${latest.weather_condition}`
                : 'No data yet'}
              icon="🌡️"
              color={latest ? (WEATHER_COLORS[latest.weather_condition] ?? 'var(--text-primary)') : undefined}
            />
            <StatusCard
              label="Predicted Traffic Volume"
              value={latest ? `${Math.round(latest.predicted_vehicle_count)} vehicles` : 'No data yet'}
              icon="🚗"
              color="var(--accent-green)"
              sub={latest ? `Actual: ${latest.actual_vehicle_count} · Δ ${Math.round(latest.predicted_vehicle_count - latest.actual_vehicle_count)}` : undefined}
            />
            <StatusCard
              label="Average Speed"
              value={latest ? `${latest.average_speed_kmh} km/h` : 'No data yet'}
              icon="⚡"
              color="var(--accent-amber)"
            />
          </div>

          {/* Right: predictions table */}
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Recent Predictions Log</h2>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>Last {predictions.length} readings · most recent at bottom</p>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 420 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Time', 'Intersection', 'ML Pred', 'Actual', 'Delta', 'Wx'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: h === 'ML Pred' || h === 'Actual' || h === 'Delta' ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {predictions.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Waiting for API data…
                    </td></tr>
                  ) : (
                    [...predictions].reverse().map((item, i) => (
                      <PredRow key={`${item.timestamp}-${i}`} item={item} idx={i} />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ marginTop: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.06em' }}>
          <span style={{ color: 'var(--accent-cyan)' }}>♦ RandomForest Regressor</span>
        </div>
      </main>
    </div>
  )
}
