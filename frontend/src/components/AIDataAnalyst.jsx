import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter, ZAxis,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from "recharts";
import {
  BrainCircuit, Database, Send, LoaderCircle, Download, Table2,
  Sparkles, AlertCircle, ChevronDown, ShieldCheck, RefreshCw,
  MessageSquareText, BarChart3, LineChart as LineChartIcon,
  PieChart as PieChartIcon, Activity, Radar as RadarIcon,
  ScatterChart as ScatterIcon, Check, SlidersHorizontal,
} from "lucide-react";
import { getDatasetHistory, askDatasetAI } from "../services/api";
import "./AIDataAnalyst.css";

const CHART_COLORS = ["#7d1f32", "#a12a43", "#541321", "#c04a60", "#3b0c17", "#d07886"];
const CHART_OPTIONS = [
  { id: "bar", label: "Bar", icon: BarChart3 },
  { id: "line", label: "Line", icon: LineChartIcon },
  { id: "area", label: "Area", icon: Activity },
  { id: "pie", label: "Donut", icon: PieChartIcon },
  { id: "radar", label: "Radar", icon: RadarIcon },
  { id: "scatter", label: "Scatter", icon: ScatterIcon },
];

const PROMPTS = [
  "Show the top 10 values by category",
  "Calculate descriptive statistics for numeric columns",
  "Find missing values in every column",
  "Show the strongest correlations",
  "Calculate the average for each category",
];

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number" && Number.isFinite(value)) return numberFormat.format(value);
  return String(value);
}

function exportCSV(columns, records) {
  if (!columns?.length || !records?.length) return;
  const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [columns.map(quote).join(","), ...records.map((row) => columns.map((key) => quote(row[key])).join(","))].join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "cognify-analysis.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ad-tooltip">
      {label !== undefined && <strong>{String(label)}</strong>}
      {payload.map((item, index) => (
        <div key={`${item.dataKey}-${index}`}>
          <i style={{ background: item.color || item.fill || CHART_COLORS[index % CHART_COLORS.length] }} />
          <span>{item.name || item.dataKey}</span>
          <b>{displayValue(item.value)}</b>
        </div>
      ))}
    </div>
  );
}

function ResultsChart({ result, chartType, setChartType }) {
  const records = result?.records || [];
  const columns = result?.columns || [];
  const labelKey = columns[0];
  const numericKeys = columns.slice(1).filter((key) =>
    records.some((row) => typeof row[key] === "number" && Number.isFinite(row[key]))
  ).slice(0, 5);
  const canChart = records.length > 0 && columns.length >= 2 && numericKeys.length > 0;
  const chartData = records.slice(0, 40);

  if (!canChart) {
    return <div className="ad-chart-empty">This result is best viewed as a table.</div>;
  }

  const common = (
    <>
      <CartesianGrid stroke="#35151d" strokeDasharray="3 5" vertical={false} />
      <XAxis dataKey={labelKey} tick={{ fill: "#b99ba2", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#4b202b" }} />
      <YAxis tick={{ fill: "#b99ba2", fontSize: 11 }} tickLine={false} axisLine={false} />
      <Tooltip content={<ChartTooltip />} />
      <Legend wrapperStyle={{ color: "#d8c3c8", fontSize: 11 }} />
    </>
  );

  return (
    <div className="ad-chart-wrap">
      <div className="ad-chart-switcher" role="tablist" aria-label="Chart type">
        {CHART_OPTIONS.map(({ id, label, icon: Icon }) => (
          <button type="button" role="tab" aria-selected={chartType === id} className={chartType === id ? "active" : ""} key={id} onClick={() => setChartType(id)}>
            <Icon size={14} /><span>{label}</span>
          </button>
        ))}
      </div>
      <div className="ad-chart-canvas">
        {chartType === "pie" ? (
          <ResponsiveContainer width="100%" height={330}>
            <PieChart>
              <Pie data={chartData} dataKey={numericKeys[0]} nameKey={labelKey} innerRadius={76} outerRadius={125} paddingAngle={3} stroke="#16080c">
                {chartData.map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend verticalAlign="bottom" />
            </PieChart>
          </ResponsiveContainer>
        ) : chartType === "radar" ? (
          <ResponsiveContainer width="100%" height={330}>
            <RadarChart data={chartData.slice(0, 12)} outerRadius="72%">
              <PolarGrid stroke="#48202a" />
              <PolarAngleAxis dataKey={labelKey} tick={{ fill: "#c5aab0", fontSize: 10 }} />
              <PolarRadiusAxis tick={{ fill: "#967780", fontSize: 9 }} axisLine={false} />
              {numericKeys.slice(0, 3).map((key, index) => <Radar key={key} name={key} dataKey={key} stroke={CHART_COLORS[index]} fill={CHART_COLORS[index]} fillOpacity={0.18} />)}
              <Tooltip content={<ChartTooltip />} /><Legend />
            </RadarChart>
          </ResponsiveContainer>
        ) : chartType === "scatter" ? (
          <ResponsiveContainer width="100%" height={330}>
            <ScatterChart margin={{ top: 12, right: 20, bottom: 12, left: 0 }}>
              <CartesianGrid stroke="#35151d" strokeDasharray="3 5" />
              <XAxis type="number" dataKey={numericKeys[0]} name={numericKeys[0]} tick={{ fill: "#b99ba2", fontSize: 10 }} />
              <YAxis type="number" dataKey={numericKeys[1] || numericKeys[0]} name={numericKeys[1] || numericKeys[0]} tick={{ fill: "#b99ba2", fontSize: 10 }} />
              <ZAxis range={[55, 110]} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<ChartTooltip />} />
              <Scatter name="Dataset values" data={chartData} fill={CHART_COLORS[1]} />
            </ScatterChart>
          </ResponsiveContainer>
        ) : chartType === "line" ? (
          <ResponsiveContainer width="100%" height={330}>
            <LineChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
              {common}
              {numericKeys.map((key, index) => <Line key={key} type="monotone" dataKey={key} stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={2.5} dot={{ r: 3, fill: CHART_COLORS[index % CHART_COLORS.length] }} activeDot={{ r: 5 }} />)}
            </LineChart>
          </ResponsiveContainer>
        ) : chartType === "area" ? (
          <ResponsiveContainer width="100%" height={330}>
            <AreaChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
              {common}
              {numericKeys.map((key, index) => <Area key={key} type="monotone" dataKey={key} stroke={CHART_COLORS[index % CHART_COLORS.length]} fill={CHART_COLORS[index % CHART_COLORS.length]} fillOpacity={0.2} strokeWidth={2.3} />)}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={330}>
            <BarChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
              {common}
              {numericKeys.map((key, index) => <Bar key={key} dataKey={key} fill={CHART_COLORS[index % CHART_COLORS.length]} radius={[5, 5, 0, 0]} maxBarSize={48} />)}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default function AIDataAnalyst() {
  const [datasets, setDatasets] = useState([]);
  const [datasetId, setDatasetId] = useState("");
  const [question, setQuestion] = useState("");
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [chartType, setChartType] = useState("bar");
  const [showIdeas, setShowIdeas] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoadingDatasets(true);
        const response = await getDatasetHistory();
        const items = Array.isArray(response) ? response : (response?.datasets || []);
        if (!active) return;
        setDatasets(items);
        if (items.length) setDatasetId(String(items[0].id));
      } catch (err) {
        if (active) setError(err?.message || "Unable to load datasets.");
      } finally {
        if (active) setLoadingDatasets(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const selectedDataset = useMemo(
    () => datasets.find((item) => String(item.id) === String(datasetId)),
    [datasets, datasetId]
  );

  const numericCount = useMemo(() => Number(selectedDataset?.columns_count || selectedDataset?.column_count || 0), [selectedDataset]);

  async function submitQuestion(event) {
    event?.preventDefault();
    const clean = question.trim();
    if (!datasetId) return setError("Select a dataset first.");
    if (!clean) return setError("Enter a question to continue.");
    setError("");
    setAsking(true);
    try {
      const response = await askDatasetAI(datasetId, clean);
      if (!response?.success) throw new Error(response?.error || "Analysis could not be completed.");
      setResult(response);
      const suggested = response.chart_type;
      setChartType(CHART_OPTIONS.some((option) => option.id === suggested) ? suggested : "bar");
      setHistory((items) => [{
        id: `${Date.now()}-${items.length}`,
        question: clean,
        answer: response.answer || "Analysis completed.",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }, ...items].slice(0, 6));
      setQuestion("");
    } catch (err) {
      setError(err?.message || "Unable to complete the analysis.");
    } finally {
      setAsking(false);
    }
  }

  function askAgain(value) {
    setQuestion(value);
    setError("");
  }

  return (
    <main className="ad-shell">
      <header className="ad-top">
        <div className="ad-mark"><BrainCircuit size={19} /></div>
        <div className="ad-brand"><strong>COGNIFY</strong><span>DATA INTELLIGENCE</span></div>
        <div className="ad-top-spacer" />
        <span className="ad-live"><i /> LIVE ENGINE</span>
      </header>

      <section className="ad-control-panel">
        <div className="ad-source">
          <div className="ad-source-icon"><Database size={18} /></div>
          <div className="ad-source-copy"><span>DATA SOURCE</span><strong>{selectedDataset?.filename || selectedDataset?.name || "Choose a dataset"}</strong></div>
          <div className="ad-select">
            <select value={datasetId} onChange={(event) => { setDatasetId(event.target.value); setResult(null); setError(""); }} disabled={loadingDatasets || !datasets.length} aria-label="Select dataset">
              {loadingDatasets && <option value="">Loading…</option>}
              {!loadingDatasets && !datasets.length && <option value="">No datasets available</option>}
              {datasets.map((item) => <option key={item.id} value={item.id}>{item.filename || item.name || `Dataset ${item.id}`}</option>)}
            </select><ChevronDown size={15} />
          </div>
        </div>

        <form className="ad-query" onSubmit={submitQuestion}>
          <div className="ad-query-icon"><Sparkles size={17} /></div>
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask anything about your data…" rows={2} maxLength={1000} disabled={asking || !datasetId} />
          <button type="submit" disabled={asking || !datasetId || !question.trim()} aria-label="Run analysis">
            {asking ? <LoaderCircle className="ad-spin" size={19} /> : <Send size={18} />}
          </button>
        </form>
        <div className="ad-query-foot">
          <button type="button" onClick={() => setShowIdeas((value) => !value)}><SlidersHorizontal size={13} /> {showIdeas ? "Hide suggestions" : "Suggestions"}</button>
          <span>{question.length}/1000</span>
        </div>
        {showIdeas && <div className="ad-suggestions">{PROMPTS.map((prompt) => <button type="button" key={prompt} onClick={() => { setQuestion(prompt); setShowIdeas(false); setError(""); }}>{prompt}</button>)}</div>}
      </section>

      {error && <div className="ad-error"><AlertCircle size={16} /><span>{error}</span></div>}

      {asking && <div className="ad-loading"><span className="ad-loading-ring"><LoaderCircle size={21} /></span><span>Processing dataset</span><i /><i /><i /></div>}

      {result && (
        <section className="ad-output">
          <div className="ad-output-top">
            <div className="ad-result-mark"><Check size={15} /></div>
            <div className="ad-result-meta"><strong>{result.filename || selectedDataset?.filename || "Analysis result"}</strong><span>{result.rows_returned ?? result.records?.length ?? 0} result rows · {result.operation || "analysis"}</span></div>
            <button type="button" className="ad-export" onClick={() => exportCSV(result.columns, result.records)} disabled={!result.records?.length}><Download size={15} /> CSV</button>
          </div>

          <article className="ad-insight">
            <div className="ad-insight-icon"><BrainCircuit size={18} /></div>
            <p>{result.answer || "Analysis completed."}</p>
          </article>

          {result.records?.length > 0 && (
            <>
              <section className="ad-card">
                <div className="ad-card-top"><div className="ad-card-icon"><BarChart3 size={17} /></div><span>VISUAL MODE</span><small>{result.records.length} POINTS</small></div>
                <ResultsChart result={result} chartType={chartType} setChartType={setChartType} />
              </section>

              <section className="ad-card ad-table-card">
                <div className="ad-card-top"><div className="ad-card-icon"><Table2 size={17} /></div><span>RESULT DATA</span><small>{result.columns?.length || 0} FIELDS</small></div>
                <div className="ad-table-scroll">
                  <table><thead><tr>{(result.columns || []).map((column) => <th key={column}>{column}</th>)}</tr></thead>
                    <tbody>{result.records.map((record, index) => <tr key={index}>{(result.columns || []).map((column) => <td key={column}>{displayValue(record[column])}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {result.note && <div className="ad-privacy"><ShieldCheck size={14} /><span>{result.note}</span></div>}
        </section>
      )}

      {history.length > 0 && (
        <section className="ad-history">
          <div className="ad-history-head"><MessageSquareText size={16} /><span>RECENT QUERIES</span></div>
          {history.map((item) => <div className="ad-history-row" key={item.id}>
            <div><strong>{item.question}</strong><small>{item.time} · {item.answer}</small></div>
            <button type="button" onClick={() => askAgain(item.question)} title="Ask again"><RefreshCw size={14} /></button>
          </div>)}
        </section>
      )}
      <footer className="ad-footer"><span>COGNIFY DATA</span><i /> GROQ · PANDAS</footer>
    </main>
  );
}
