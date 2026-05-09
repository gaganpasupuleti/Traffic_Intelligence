/** Sample NotebookLM-style body for `DetailedReportView` demos */
export const SAMPLE_NOTEBOOKLM_MARKDOWN = `
## Executive summary

Hyderabad corridor throughput remains **within forecast bands** during peak windows. The following synthesis combines simulated sensor aggregates with model confidence intervals.

### Key observations

- Jubilee Hills and Gachibowli show the highest variance in predicted vs. actual counts during evening peak.
- Weather penalties (rain / fog) correlate with −8–15% throughput in the rolling 50-sample buffer.

| Zone | Avg latency (sim) | Notes |
|------|-------------------|-------|
| IT corridor | Low | Stable green waves |
| Flyover merge | Medium | Speed variance |

> **Note:** Figures below the chart are illustrative; plug in live \`/latest-traffic\` aggregates for production.

### Diagnostic query

Run this in your warehouse sandbox to reproduce the peak-hour slice:

\`\`\`sql
SELECT corridor_id,
       DATE_TRUNC('hour', ts) AS hr,
       AVG(vehicle_count) AS avg_vc
FROM traffic.fact_readings
WHERE city = 'Hyderabad'
  AND ts >= CURRENT_DATE - INTERVAL '7' DAY
GROUP BY 1, 2
ORDER BY hr DESC
LIMIT 500;
\`\`\`
`.trim()
