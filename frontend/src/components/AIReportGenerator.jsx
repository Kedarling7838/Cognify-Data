import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowDownToLine, BrainCircuit, CheckCircle2,
  ChevronDown, FileBarChart2, FileText, Lightbulb, Loader2, RefreshCw,
  ShieldCheck, Sparkles, Target, TrendingUp, Database, Rows3, Columns3,
  Presentation, FileSpreadsheet, LayoutDashboard, Download,
} from "lucide-react";
import { getDatasetHistory } from "../services/api";
import "./AIReportGenerator.css";
import "./AIReportGenerator_Exports.css";

const API_BASE = `${window.location.protocol}//${window.location.hostname}:8000/api/datasets`;
const safeArray = (v) => Array.isArray(v) ? v : [];
const safeObject = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const number = (v) => Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function csrfToken() {
  const item = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("csrftoken="));
  return item ? decodeURIComponent(item.split("=").slice(1).join("=")) : "";
}

async function requestReport(datasetId) {
  const response = await fetch(`${API_BASE}/reports/analyze/`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest", ...(csrfToken() ? { "X-CSRFToken": csrfToken() } : {}) },
    body: JSON.stringify({ dataset_id: datasetId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.error || data.detail || `Report generation failed (${response.status}).`);
  return data;
}

async function downloadServerExport(format, result) {
  const response = await fetch(`${API_BASE}/reports/export/${format}/`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest", ...(csrfToken() ? { "X-CSRFToken": csrfToken() } : {}) },
    body: JSON.stringify({ dataset_id: result.dataset_id, report_data: result.report_data, ai_report: result.ai_report }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Export failed (${response.status}).`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(result.filename || "dataset").replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]/gi, "-")}-cognify-report.${format === "excel" ? "xlsx" : format}`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function makeDashboardHtml(result) {
  const data = safeObject(result.report_data);
  const report = safeObject(result.ai_report);
  const overview = safeObject(data.overview);
  const numeric = safeObject(data.numeric_summary);
  const categorical = safeObject(data.categorical_summary);
  const numericEntries = Object.entries(numeric).slice(0, 8);
  const categoryEntries = Object.entries(categorical).slice(0, 5);
  const metricCards = [
    ["Total rows", number(overview.total_rows)],
    ["Columns", number(overview.total_columns)],
    ["Missing values", number(overview.missing_values)],
    ["Data quality", `${number(overview.quality_score)}%`],
  ];
  const bar = (label, value, max) => {
    const width = max > 0 ? Math.max(2, Math.min(100, Number(value) / max * 100)) : 0;
    return `<div class="bar-row"><span>${escapeHtml(label)}</span><div class="track"><i style="width:${width}%"></i></div><b>${escapeHtml(number(value))}</b></div>`;
  };
  const numericChart = numericEntries.length
    ? numericEntries.map(([name, stats]) => bar(name, stats.mean, Math.max(...numericEntries.map(([, s]) => Math.abs(Number(s.mean) || 0)), 1))).join("")
    : `<p class="muted">No numeric columns available.</p>`;
  const categoryChart = categoryEntries.map(([name, values]) => {
    const top = safeArray(values).slice(0, 5);
    const max = Math.max(...top.map((v) => Number(v.count) || 0), 1);
    return `<div class="category"><h3>${escapeHtml(name)}</h3>${top.map((v) => bar(v.value, v.count, max)).join("")}</div>`;
  }).join("") || `<p class="muted">No categorical columns available.</p>`;
  const findings = safeArray(report.key_findings).map((x) => `<article><b>${escapeHtml(x.title)}</b><p>${escapeHtml(x.description)}</p></article>`).join("");
  const recommendations = safeArray(report.business_recommendations).map((x) => `<article><b>${escapeHtml(x.title)}</b><p>${escapeHtml(x.description)}</p></article>`).join("");
  const correlations = safeObject(data.correlations);
  const corrRows = Object.entries(correlations).slice(0, 10).map(([name, values]) => `<tr><td>${escapeHtml(name)}</td><td>${Object.entries(values || {}).filter(([k]) => k !== name).slice(0, 4).map(([k,v]) => `${escapeHtml(k)}: ${escapeHtml(v)}`).join(" · ")}</td></tr>`).join("");
  const json = JSON.stringify(result).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(report.report_title || "Cognify Data Dashboard")}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#0b0d14;color:#f5f5f7;font:14px/1.55 Inter,Segoe UI,Arial,sans-serif}.wrap{max-width:1440px;margin:auto;padding:34px}.top{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap}.brand{color:#e6a9bf;font-size:12px;letter-spacing:2px;font-weight:800}.top h1{font-size:30px;margin:8px 0}.muted{color:#9ba1b2}.pill{border:1px solid #603148;border-radius:30px;padding:8px 13px;color:#f1b7ca}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:25px 0}.card,.panel{background:#151824;border:1px solid #292d3d;border-radius:16px;padding:20px}.card span{display:block;color:#aeb3c1}.card strong{font-size:27px;display:block;margin-top:8px}.cols{display:grid;grid-template-columns:1.15fr .85fr;gap:16px}.panel{margin-bottom:16px}.panel h2{font-size:18px;margin:0 0 15px}.summary{font-size:15px;color:#d9dbe2;white-space:pre-wrap}.bar-row{display:grid;grid-template-columns:minmax(90px,170px) 1fr 75px;gap:12px;align-items:center;margin:11px 0}.bar-row span{overflow-wrap:anywhere;color:#c8cbd5}.track{height:9px;background:#292d3c;border-radius:20px;overflow:hidden}.track i{display:block;height:100%;background:linear-gradient(90deg,#8d3156,#df85a7);border-radius:20px}.bar-row b{text-align:right;font-size:12px}.category{padding:12px 0;border-top:1px solid #292d3d}.category h3{font-size:14px;color:#e8b4c8}.insights{display:grid;grid-template-columns:1fr 1fr;gap:12px}.insights article{padding:14px;border:1px solid #303447;border-radius:12px}.insights p{color:#b9bdc9;margin-bottom:0}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:10px;border-bottom:1px solid #303447;vertical-align:top}th{color:#e6a9bf}.foot{color:#9298a8;font-size:12px;margin-top:24px}@media(max-width:850px){.grid{grid-template-columns:repeat(2,1fr)}.cols{grid-template-columns:1fr}}@media(max-width:520px){.wrap{padding:16px}.grid{grid-template-columns:1fr}.insights{grid-template-columns:1fr}.bar-row{grid-template-columns:90px 1fr 55px}}
</style></head><body><main class="wrap"><header class="top"><div><div class="brand">COGNIFY DATA · BUSINESS INTELLIGENCE</div><h1>${escapeHtml(report.report_title || "AI Analytics Dashboard")}</h1><div class="muted">${escapeHtml(result.filename || "Dataset")} · Generated ${escapeHtml(result.generated_at || "")}</div></div><span class="pill">Interactive analytics snapshot</span></header>
<section class="grid">${metricCards.map(([k,v]) => `<div class="card"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join("")}</section>
<section class="panel"><h2>Executive summary</h2><div class="summary">${escapeHtml(report.executive_summary || "No summary available.")}</div></section>
<div class="cols"><section class="panel"><h2>Numeric indicators · Mean values</h2>${numericChart}</section><section class="panel"><h2>Category distribution · Top values</h2>${categoryChart}</section></div>
<section class="panel"><h2>Key findings</h2><div class="insights">${findings || "<p class='muted'>No findings available.</p>"}</div></section>
<section class="panel"><h2>Business recommendations</h2><div class="insights">${recommendations || "<p class='muted'>No recommendations available.</p>"}</div></section>
<section class="panel"><h2>Correlation overview</h2><div class="table-wrap"><table><thead><tr><th>Metric</th><th>Related correlations</th></tr></thead><tbody>${corrRows || "<tr><td colspan='2'>No correlation matrix available.</td></tr>"}</tbody></table></div></section>
<section class="panel"><h2>Conclusion</h2><p>${escapeHtml(report.conclusion || "No conclusion available.")}</p></section>
<p class="foot">Created by Cognify Data. Calculations use dataset aggregates. Correlation does not imply causation. This standalone HTML file contains its dashboard data and does not require a Power BI installation.</p></main>
<script>const dashboardData=${json};document.title=(dashboardData.ai_report&&dashboardData.ai_report.report_title)||document.title;</script></body></html>`;
}

function downloadDashboard(result) {
  const html = makeDashboardHtml(result);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(result.filename || "dataset").replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]/gi, "-")}-powerbi-style-dashboard.html`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function Metric({ icon: Icon, label, value, note }) {
  return <article className="air-metric"><span className="air-metric-icon"><Icon size={18} /></span><span className="air-metric-label">{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</article>;
}

function ListSection({ icon: Icon, title, items, emptyText, kind = "" }) {
  const list = safeArray(items);
  return <section className="air-panel"><div className="air-panel-heading"><span className={`air-heading-icon ${kind}`}><Icon size={18} /></span><div><h2>{title}</h2><p>{list.length ? `${list.length} generated items` : emptyText}</p></div></div>{list.length ? <div className="air-insight-list">{list.map((item, index) => <article className="air-insight" key={`${item.title || title}-${index}`}><div className="air-insight-top"><strong>{item.title || `Insight ${index + 1}`}</strong>{(item.importance || item.priority) && <span className={`air-priority ${(item.importance || item.priority).toLowerCase()}`}>{item.importance || item.priority}</span>}</div><p>{item.description || ""}</p></article>)}</div> : <div className="air-empty-inline">No items returned for this section.</div>}</section>;
}

export default function AIReportGenerator() {
  const [datasets, setDatasets] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function loadDatasets() {
    setLoadingDatasets(true); setError("");
    try {
      const response = await getDatasetHistory();
      const items = Array.isArray(response) ? response : safeArray(response?.datasets);
      setDatasets(items);
      setSelectedId((current) => current && items.some((item) => String(item.id) === current) ? current : items[0] ? String(items[0].id) : "");
    } catch (err) { setError(err.message || "Unable to load dataset history."); }
    finally { setLoadingDatasets(false); }
  }

  useEffect(() => { loadDatasets(); }, []);

  async function handleGenerate() {
    if (!selectedId) { setError("Please select a dataset first."); return; }
    setGenerating(true); setError(""); setResult(null);
    try { setResult(await requestReport(selectedId)); }
    catch (err) { setError(err.message || "Unable to generate the AI report."); }
    finally { setGenerating(false); }
  }

  async function handleExport(format) {
    if (!result) return;
    setExporting(format); setError("");
    try { await downloadServerExport(format, result); }
    catch (err) { setError(err.message || `Unable to export ${format}.`); }
    finally { setExporting(""); }
  }

  const report = safeObject(result?.ai_report);
  const data = safeObject(result?.report_data);
  const overview = safeObject(data.overview);
  const numericSummary = safeObject(data.numeric_summary);
  const numericRows = useMemo(() => Object.entries(numericSummary), [numericSummary]);

  return <div className="air-page">
    <div className="air-hero"><div className="air-hero-copy"><span className="air-eyebrow"><Sparkles size={14} /> COGNIFY DATA INTELLIGENCE</span><h1>AI Report Generator</h1><p>Generate an interactive Power BI-style dashboard, editable executive presentation and downloadable analytical reports from your dataset.</p><div className="air-hero-tags"><span><ShieldCheck size={14} /> Private dataset analysis</span><span><BrainCircuit size={14} /> Groq-powered insights</span></div></div><div className="air-hero-art"><div className="air-orbit orbit-one"/><div className="air-orbit orbit-two"/><div className="air-art-core"><FileBarChart2 size={42}/></div><Sparkles className="air-spark spark-one" size={19}/><Activity className="air-spark spark-two" size={22}/></div></div>

    <section className="air-config air-panel"><div className="air-config-heading"><div><span className="air-kicker">REPORT WORKSPACE</span><h2>Generate a dataset report</h2><p>Select a dataset to analyze its structure, quality, statistical patterns and business opportunities.</p></div><button className="air-icon-button" onClick={loadDatasets} disabled={loadingDatasets} title="Refresh datasets"><RefreshCw size={17}/></button></div><div className="air-config-row"><label className="air-select-wrap"><span>SELECT DATASET</span><div className="air-select-control"><Database size={17}/><select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setResult(null); }} disabled={loadingDatasets || !datasets.length}><option value="">{loadingDatasets ? "Loading datasets..." : datasets.length ? "Choose a dataset" : "No datasets available"}</option>{datasets.map((item) => <option key={item.id} value={item.id}>{item.filename || item.name || `Dataset ${item.id}`}</option>)}</select><ChevronDown size={16}/></div></label><button className="air-generate-button" onClick={handleGenerate} disabled={generating || loadingDatasets || !selectedId}>{generating ? <><Loader2 className="air-spin" size={18}/> Analyzing dataset...</> : <><Sparkles size={18}/> Generate AI Report</>}</button></div>{error && <div className="air-error" role="alert"><AlertTriangle size={17}/>{error}</div>}{generating && <div className="air-progress"><span/><p>Analyzing dataset and preparing report insights. This may take a moment.</p></div>}</section>

    {!result && !generating && <section className="air-empty-state"><div className="air-empty-icon"><FileText size={30}/></div><h2>Your report workspace is ready</h2><p>Generate a report to unlock the dashboard, PowerPoint, PDF and Excel downloads.</p><div className="air-empty-features"><span><CheckCircle2 size={15}/> Power BI-style dashboard</span><span><CheckCircle2 size={15}/> Editable PPTX presentation</span><span><CheckCircle2 size={15}/> PDF and Excel reports</span></div></section>}

    {result && <div className="air-results">
      <div className="air-result-heading"><div><span className="air-kicker">GENERATED REPORT · {new Date(result.generated_at || Date.now()).toLocaleString()}</span><h2>{report.report_title || "Dataset Analysis Report"}</h2><p>{result.filename || "Selected dataset"}</p></div><button className="air-download-button" onClick={() => downloadDashboard(result)}><LayoutDashboard size={17}/> Download Power BI Dashboard</button></div>
      <section className="air-panel"><div className="air-panel-heading"><span className="air-heading-icon purple"><Download size={18}/></span><div><h2>Download your deliverables</h2><p>All exports use the generated report and selected dataset ownership is checked by the server.</p></div></div><div className="air-export-grid">
        <button className="air-export-card" onClick={() => downloadDashboard(result)}><LayoutDashboard size={23}/><b>Power BI-style Dashboard</b><span>Standalone interactive HTML file</span><strong>Download HTML</strong></button>
        <button className="air-export-card" onClick={() => handleExport("pptx")} disabled={!!exporting}><Presentation size={23}/><b>Advanced PowerPoint</b><span>Editable 15+ slide presentation</span><strong>{exporting === "pptx" ? "Preparing..." : "Download PPTX"}</strong></button>
        <button className="air-export-card" onClick={() => handleExport("pdf")} disabled={!!exporting}><FileText size={23}/><b>PDF Analytics Report</b><span>Executive summary and findings</span><strong>{exporting === "pdf" ? "Preparing..." : "Download PDF"}</strong></button>
        <button className="air-export-card" onClick={() => handleExport("xlsx")} disabled={!!exporting}><FileSpreadsheet size={23}/><b>Excel Analytics Report</b><span>Overview, statistics and AI insights</span><strong>{exporting === "xlsx" ? "Preparing..." : "Download XLSX"}</strong></button>
      </div>{exporting && <p className="air-export-status"><Loader2 className="air-spin" size={15}/> Preparing {exporting.toUpperCase()} file…</p>}</section>
      <div className="air-metrics-grid"><Metric icon={Rows3} label="Total rows" value={number(overview.total_rows)}/><Metric icon={Columns3} label="Total columns" value={number(overview.total_columns)}/><Metric icon={AlertTriangle} label="Missing values" value={number(overview.missing_values)}/><Metric icon={Activity} label="Data quality score" value={`${number(overview.quality_score)}%`} note="Calculated from missing and duplicate values"/></div>
      <section className="air-panel air-summary"><div className="air-panel-heading"><span className="air-heading-icon purple"><BrainCircuit size={18}/></span><div><h2>Executive summary</h2><p>AI-generated overview of the selected dataset</p></div></div><p className="air-summary-text">{report.executive_summary || "No executive summary was returned."}</p></section>
      <div className="air-two-column"><ListSection icon={TrendingUp} title="Key findings" items={report.key_findings} emptyText="No findings available." kind="purple"/><ListSection icon={Target} title="Business recommendations" items={report.business_recommendations} emptyText="No recommendations available." kind="rose"/><ListSection icon={AlertTriangle} title="Risks & data quality" items={report.risks_and_data_quality} emptyText="No risks available." kind="amber"/><ListSection icon={Lightbulb} title="Opportunities" items={report.opportunities} emptyText="No opportunities available." kind="green"/></div>
      {numericRows.length > 0 && <section className="air-panel"><div className="air-panel-heading"><span className="air-heading-icon cyan"><Activity size={18}/></span><div><h2>Numeric analysis</h2><p>Statistical profile calculated locally using Pandas</p></div></div><div className="air-table-wrap"><table className="air-table"><thead><tr><th>Column</th><th>Mean</th><th>Median</th><th>Minimum</th><th>Maximum</th><th>Std. deviation</th></tr></thead><tbody>{numericRows.map(([name, stats]) => <tr key={name}><td>{name}</td><td>{number(stats.mean)}</td><td>{number(stats.median)}</td><td>{number(stats.min)}</td><td>{number(stats.max)}</td><td>{number(stats.std)}</td></tr>)}</tbody></table></div></section>}
      <section className="air-panel air-conclusion"><h2>Conclusion</h2><p>{report.conclusion || "No conclusion was returned."}</p>{safeArray(report.limitations).length > 0 && <div className="air-limitations"><strong>Analysis limitations</strong><ul>{report.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}</section>
      <p className="air-privacy"><ShieldCheck size={15}/>{result.privacy_note || "Dataset analysis is performed securely for your account."}</p>
    </div>}
  </div>;
}
