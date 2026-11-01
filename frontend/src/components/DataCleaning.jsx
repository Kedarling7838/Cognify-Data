import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowRight, ArrowUpRight,
  Check, CheckCircle2, ChevronDown, CircleHelp, Database, FileSpreadsheet,
  Filter, Layers3, LoaderCircle, RefreshCw, Save, Search, ShieldCheck,
  Sparkles, WandSparkles, X
} from "lucide-react";
import {
  getDatasetHistory,
  getCleaningProfile,
  previewDatasetCleaning,
  saveCleanedDataset,
  exportCleanedDataset,
} from "../services/api";
import "./DataCleaning.css";

const DEFAULT_OPTIONS = {
  drop_columns: [],
  rename_columns: {},
  missing: {},
  duplicates: "keep",
  convert_types: {},
  outliers: {},
  scaling: {},
};
const fmt = (value) => Number(value || 0).toLocaleString();
const pct = (value) => `${Number(value || 0).toFixed(1)}%`;

function MetricCard({ icon: Icon, label, value, detail, tone = "neutral" }) {
  return (
    <article className={`clean-metric clean-metric-${tone}`}>
      <div className="clean-metric-top">
        <span>{label}</span>
        <i><Icon size={17} /></i>
      </div>
      <strong>{fmt(value)}</strong>
      <small>{detail}</small>
    </article>
  );
}

export default function DataCleaning() {
  const [datasets, setDatasets] = useState([]);
  const [datasetId, setDatasetId] = useState("");
  const [profile, setProfile] = useState(null);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [preview, setPreview] = useState(null);
  const [activeTab, setActiveTab] = useState("profile");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [profiling, setProfiling] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [renameDraft, setRenameDraft] = useState({});
  const [constantDraft, setConstantDraft] = useState({});

  const loadDatasets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getDatasetHistory();
      const list = Array.isArray(result) ? result : result?.datasets || [];
      setDatasets(list);
      if (list.length && !datasetId) setDatasetId(String(list[0].id));
    } catch (err) {
      setError(err.message || "Unable to load your saved datasets.");
    } finally {
      setLoading(false);
    }
  }, [datasetId]);

  const loadProfile = useCallback(async (id) => {
    if (!id) {
      setProfile(null);
      return;
    }
    setProfiling(true);
    setError("");
    setNotice("");
    setPreview(null);
    try {
      const data = await getCleaningProfile(id);
      setProfile(data);
      setOptions(DEFAULT_OPTIONS);
      setRenameDraft({});
      setConstantDraft({});
      setActiveTab("profile");
    } catch (err) {
      setProfile(null);
      setError(err.message || "Unable to inspect this dataset.");
    } finally {
      setProfiling(false);
    }
  }, []);

  useEffect(() => { loadDatasets(); }, []);
  useEffect(() => { if (datasetId) loadProfile(datasetId); }, [datasetId, loadProfile]);

  const columns = profile?.columns || [];
  const filteredColumns = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return columns;
    return columns.filter((col) =>
      `${col.column} ${col.dtype}`.toLowerCase().includes(term)
    );
  }, [columns, search]);

  const activeRules = useMemo(() => {
    const missing = Object.values(options.missing).filter((v) => v?.method && v.method !== "none").length;
    const types = Object.values(options.convert_types).filter(Boolean).length;
    const outliers = Object.values(options.outliers).filter((v) => v && v !== "none").length;
    const scaling = Object.values(options.scaling).filter((v) => v && v !== "none").length;
    const renamed = Object.entries(renameDraft).filter(([old, value]) => value.trim() && value.trim() !== old).length;
    return missing + types + outliers + scaling + renamed + options.drop_columns.length + (options.duplicates === "remove" ? 1 : 0);
  }, [options, renameDraft]);

  function updateOption(section, key, value) {
    setOptions((old) => ({ ...old, [section]: { ...old[section], [key]: value } }));
    setPreview(null);
    setNotice("");
  }

  function setMissing(column, method) {
    updateOption("missing", column, {
      method,
      ...(method === "constant" ? { value: constantDraft[column] ?? "Unknown" } : {}),
    });
  }

  function collectOptions() {
    const rename_columns = Object.fromEntries(
      Object.entries(renameDraft)
        .filter(([old, value]) => value.trim() && value.trim() !== old)
        .map(([old, value]) => [old, value.trim()])
    );
    const missing = { ...options.missing };
    Object.entries(missing).forEach(([column, config]) => {
      if (config.method === "constant") config.value = constantDraft[column] ?? "Unknown";
    });
    return { ...options, rename_columns, missing };
  }

  async function handlePreview() {
    if (!datasetId) return;
    setPreviewing(true);
    setError("");
    setNotice("");
    try {
      const result = await previewDatasetCleaning(datasetId, collectOptions());
      setPreview(result);
      setActiveTab("preview");
    } catch (err) {
      setError(err.message || "Could not generate the cleaning preview.");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSave() {
    if (!datasetId) return;
    if (!activeRules) {
      setError("Choose at least one cleaning operation before saving.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await saveCleanedDataset(datasetId, collectOptions());
      setNotice(`${result.message || "Cleaned dataset saved."} ${result.dataset?.filename || ""}`);
      await loadDatasets();
    } catch (err) {
      setError(err.message || "Unable to save the cleaned dataset.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExport(format) {
    if (!datasetId) return;
    setExporting(format);
    setError("");
    setNotice("");
    try {
      await exportCleanedDataset(datasetId, collectOptions(), format);
      setNotice(`Cleaned ${format.toUpperCase()} file exported.`);
    } catch (err) {
      setError(err.message || "Unable to export cleaned data.");
    } finally {
      setExporting("");
    }
  }

  const sourceName = profile?.filename || datasets.find((d) => String(d.id) === String(datasetId))?.filename || "Selected dataset";
  const quality = profile
    ? Math.max(0, 100 - (Number(profile.missing_total || 0) / Math.max(1, Number(profile.rows || 0) * Number(profile.columns_count || 0))) * 100)
    : 0;

  return (
    <main className="clean-workspace">
      <header className="clean-page-header">
        <div className="clean-heading-copy">
          <div className="clean-kicker"><span className="clean-kicker-dot" /> DATA OPERATIONS <span>/</span> PREPARATION</div>
          <h1>Data <em>Cleaning</em></h1>
          <p>Inspect data quality, apply controlled transformations, and create a clean dataset ready for analysis.</p>
        </div>
        <div className="clean-header-actions">
          <span className="clean-secure"><ShieldCheck size={15} /> Original data protected</span>
          <button className="clean-icon-button" onClick={loadDatasets} disabled={loading} title="Refresh datasets"><RefreshCw size={17} className={loading ? "clean-spin" : ""} /></button>
        </div>
      </header>

      <section className="clean-source-bar">
        <div className="clean-source-symbol"><Database size={19} /></div>
        <div className="clean-source-meta">
          <span className="clean-label">WORKING DATASET</span>
          <strong>{sourceName}</strong>
          <small>{profile ? `${fmt(profile.rows)} records · ${fmt(profile.columns_count)} fields` : "Choose a dataset to begin"}</small>
        </div>
        <div className="clean-source-select">
          <label htmlFor="clean-dataset">Switch dataset</label>
          <div className="clean-select-shell">
            <select id="clean-dataset" value={datasetId} onChange={(e) => setDatasetId(e.target.value)} disabled={loading || !datasets.length}>
              <option value="">Select a dataset</option>
              {datasets.map((item) => <option key={item.id} value={item.id}>{item.filename || item.name || `Dataset ${item.id}`}</option>)}
            </select>
            <ChevronDown size={15} />
          </div>
        </div>
      </section>

      {error && <div className="clean-feedback clean-feedback-error"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X size={15} /></button></div>}
      {notice && <div className="clean-feedback clean-feedback-success"><CheckCircle2 size={17} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}

      {(loading || profiling) && <div className="clean-loading"><LoaderCircle size={23} className="clean-spin" /><strong>{loading ? "Loading datasets" : "Profiling your data"}</strong><span>Preparing your data quality workspace…</span></div>}

      {!loading && !datasets.length && (
        <div className="clean-empty-state">
          <div><Database size={28} /></div>
          <h2>No datasets available</h2>
          <p>Upload a CSV, Excel, or JSON file first. Your saved datasets will appear here.</p>
        </div>
      )}

      {profile && !profiling && (
        <>
          <section className="clean-metrics-grid">
            <MetricCard icon={Layers3} label="TOTAL ROWS" value={profile.rows} detail="Records in source" />
            <MetricCard icon={Database} label="COLUMNS" value={profile.columns_count} detail="Fields detected" />
            <MetricCard icon={AlertTriangle} label="MISSING VALUES" value={profile.missing_total} detail="Cells to review" tone={profile.missing_total ? "warning" : "good"} />
            <MetricCard icon={CopyIcon} label="DUPLICATE ROWS" value={profile.duplicate_rows} detail="Repeated records" tone={profile.duplicate_rows ? "warning" : "good"} />
          </section>

          <section className="clean-quality-strip">
            <div className="clean-quality-icon"><Activity size={18} /></div>
            <div className="clean-quality-text"><strong>Data quality overview</strong><span>Missing-value completeness estimate</span></div>
            <div className="clean-quality-progress"><div><i style={{ width: `${Math.min(100, quality)}%` }} /></div><strong>{pct(quality)}</strong></div>
            <span className="clean-quality-caption">{quality >= 95 ? "Looking good" : quality >= 80 ? "Needs attention" : "Review recommended"}</span>
          </section>

          <nav className="clean-tabs" aria-label="Data cleaning sections">
            <button className={activeTab === "profile" ? "active" : ""} onClick={() => setActiveTab("profile")}><Activity size={16} /> Quality profile <span>{columns.length}</span></button>
            <button className={activeTab === "rules" ? "active" : ""} onClick={() => setActiveTab("rules")}><WandSparkles size={16} /> Cleaning rules <span>{activeRules}</span></button>
            <button className={activeTab === "preview" ? "active" : ""} onClick={() => setActiveTab("preview")}><Filter size={16} /> Preview changes</button>
          </nav>

          {activeTab === "profile" && (
            <section className="clean-card">
              <div className="clean-card-heading">
                <div><span className="clean-overline">DATASET INSPECTION</span><h2>Column quality profile</h2><p>Understand each field before deciding what to change.</p></div>
                <div className="clean-search"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a column…" /></div>
              </div>
              <div className="clean-table-wrap">
                <table className="clean-table">
                  <thead><tr><th>Column name</th><th>Data type</th><th>Unique values</th><th>Missing</th><th>Completeness</th><th>Profile</th></tr></thead>
                  <tbody>
                    {filteredColumns.map((col) => {
                      const complete = Math.max(0, 100 - Number(col.missing_pct || 0));
                      return <tr key={col.column}>
                        <td><strong>{col.column}</strong></td>
                        <td><span className="clean-type">{col.dtype}</span></td>
                        <td>{fmt(col.unique)}</td>
                        <td><span className={Number(col.missing) ? "clean-missing-value" : "clean-okay-value"}>{fmt(col.missing)}</span></td>
                        <td><div className="clean-completeness"><span><i style={{ width: `${complete}%` }} /></span><small>{pct(complete)}</small></div></td>
                        <td>{Number(col.missing) ? <span className="clean-status clean-status-warn"><AlertTriangle size={12} /> Review</span> : <span className="clean-status clean-status-good"><Check size={12} /> Healthy</span>}</td>
                      </tr>;
                    })}
                    {!filteredColumns.length && <tr><td colSpan="6" className="clean-no-results">No columns match your search.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="clean-card-footer"><span>Showing {filteredColumns.length} of {columns.length} columns</span><button className="clean-primary-button" onClick={() => setActiveTab("rules")}>Configure cleaning <ArrowRight size={15} /></button></div>
            </section>
          )}

          {activeTab === "rules" && (
            <section className="clean-card">
              <div className="clean-card-heading">
                <div><span className="clean-overline">TRANSFORMATION SETUP</span><h2>Configure cleaning rules</h2><p>Set the treatment for each field. Changes are applied to a copy, not the source.</p></div>
                <span className="clean-rule-count"><WandSparkles size={14} /> {activeRules} active rules</span>
              </div>
              <div className="clean-rule-toolbar">
                <div><strong>Column transformations</strong><span>Configure missing values, types and outliers</span></div>
                <div className="clean-search"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search columns…" /></div>
              </div>
              <div className="clean-rules-list">
                {filteredColumns.map((col) => (
                  <article className="clean-rule-row" key={col.column}>
                    <div className="clean-rule-name"><span className="clean-column-icon"><Database size={15} /></span><div><strong>{col.column}</strong><small>{col.dtype} · {fmt(col.unique)} unique</small></div></div>
                    <div className="clean-rule-control"><label>Missing values <b>{fmt(col.missing)}</b></label><select value={options.missing[col.column]?.method || "none"} onChange={(e) => setMissing(col.column, e.target.value)}><option value="none">Keep unchanged</option><option value="drop">Drop affected rows</option><option value="mean" disabled={!col.numeric_candidate}>Fill with mean</option><option value="median" disabled={!col.numeric_candidate}>Fill with median</option><option value="mode">Fill with most common</option><option value="constant">Fill with custom value</option></select>{options.missing[col.column]?.method === "constant" && <input className="clean-custom-input" value={constantDraft[col.column] ?? "Unknown"} onChange={(e) => { setConstantDraft((old) => ({ ...old, [col.column]: e.target.value })); setPreview(null); }} placeholder="Replacement value" />}</div>
                    <div className="clean-rule-control"><label>Convert data type</label><select value={options.convert_types[col.column] || ""} onChange={(e) => updateOption("convert_types", col.column, e.target.value)}><option value="">Keep current type</option><option value="string">Text</option><option value="integer">Integer</option><option value="float">Decimal</option><option value="datetime">Date / time</option><option value="boolean">Boolean</option></select></div>
                    <div className="clean-rule-control"><label>Outlier treatment</label><select value={options.outliers[col.column] || "none"} onChange={(e) => updateOption("outliers", col.column, e.target.value)}><option value="none">No action</option><option value="clip" disabled={!col.numeric_candidate}>Clip using IQR</option><option value="remove" disabled={!col.numeric_candidate}>Remove outlier rows</option></select></div>
                    <div className="clean-rule-control"><label>Scale values</label><select value={options.scaling[col.column] || "none"} onChange={(e) => updateOption("scaling", col.column, e.target.value)}><option value="none">No scaling</option><option value="minmax" disabled={!col.numeric_candidate}>Min-max</option><option value="standard" disabled={!col.numeric_candidate}>Standard score</option></select></div>
                    <div className="clean-rule-control clean-rename-control"><label>Rename column</label><input value={renameDraft[col.column] ?? ""} onChange={(e) => { setRenameDraft((old) => ({ ...old, [col.column]: e.target.value })); setPreview(null); }} placeholder={col.column} /></div>
                    <label className="clean-drop-check"><input type="checkbox" checked={options.drop_columns.includes(col.column)} onChange={(e) => { setOptions((old) => ({ ...old, drop_columns: e.target.checked ? [...old.drop_columns, col.column] : old.drop_columns.filter((v) => v !== col.column) })); setPreview(null); }} /> Drop column</label>
                  </article>
                ))}
              </div>
              <div className="clean-global-options">
                <div><strong>Duplicate records</strong><small>Choose whether repeated rows should remain in the cleaned dataset.</small></div>
                <select value={options.duplicates} onChange={(e) => { setOptions((old) => ({ ...old, duplicates: e.target.value })); setPreview(null); }}><option value="keep">Keep duplicates</option><option value="remove">Remove duplicates</option></select>
              </div>
              <div className="clean-card-footer"><span>Changes pending: {activeRules}</span><button className="clean-primary-button" onClick={handlePreview} disabled={previewing}>{previewing ? <LoaderCircle size={15} className="clean-spin" /> : <EyeIcon />} Preview changes <ArrowRight size={15} /></button></div>
            </section>
          )}

          {activeTab === "preview" && (
            <section className="clean-card">
              <div className="clean-card-heading"><div><span className="clean-overline">REVIEW BEFORE SAVING</span><h2>Before & after preview</h2><p>Validate the transformation output before creating your cleaned dataset.</p></div><button className="clean-secondary-button" onClick={handlePreview} disabled={previewing}>{previewing ? <LoaderCircle size={15} className="clean-spin" /> : <RefreshCw size={15} />} Refresh preview</button></div>
              {!preview ? <div className="clean-preview-empty"><div><EyeIcon /></div><strong>No preview generated yet</strong><span>Configure your rules and generate a preview to inspect the result.</span><button className="clean-primary-button" onClick={() => setActiveTab("rules")}>Go to cleaning rules <ArrowRight size={15} /></button></div> : (
                <>
                  <div className="clean-diff-grid">
                    <div><span>SOURCE DATA</span><strong>{fmt(preview.before?.rows)}</strong><small>{fmt(preview.before?.columns)} columns</small></div><i><ArrowRight size={18} /></i><div className="clean-diff-result"><span>CLEANED DATA</span><strong>{fmt(preview.after?.rows)}</strong><small>{fmt(preview.after?.columns)} columns</small></div><div className="clean-diff-summary"><span>RULES APPLIED</span><strong>{fmt(preview.changes?.length || activeRules)}</strong><small>Transformation operations</small></div>
                  </div>
                  {preview.changes?.length > 0 && <div className="clean-applied-list"><strong><CheckCircle2 size={15} /> Applied transformations</strong>{preview.changes.map((change, i) => <span key={i}>{typeof change === "string" ? change : JSON.stringify(change)}</span>)}</div>}
                  <h3 className="clean-preview-subtitle">Cleaned sample records</h3>
                  <PreviewTable rows={preview.after?.preview || []} />
                  <div className="clean-card-footer"><span>Preview only · source dataset remains unchanged</span><button className="clean-primary-button" onClick={handleSave} disabled={saving || !activeRules}>{saving ? <LoaderCircle size={15} className="clean-spin" /> : <Save size={15} />} Save as new dataset</button></div>
                </>
              )}
            </section>
          )}

          <section className="clean-export-panel">
            <div className="clean-export-copy"><div className="clean-export-icon"><FileSpreadsheet size={19} /></div><div><strong>Export or save your cleaned data</strong><span>Create a new dataset or download a transformed copy.</span></div></div>
            <div className="clean-export-actions">
              {["csv", "xlsx", "json"].map((format) => <button key={format} className="clean-export-button" onClick={() => handleExport(format)} disabled={!!exporting}>{exporting === format ? <LoaderCircle size={14} className="clean-spin" /> : <ArrowDownToLine size={14} />} {format.toUpperCase()}</button>)}
              <button className="clean-primary-button" onClick={handleSave} disabled={saving || !activeRules}>{saving ? <LoaderCircle size={15} className="clean-spin" /> : <Save size={15} />} Save new dataset</button>
            </div>
          </section>
        </>
      )}

      <footer className="clean-footnote"><ShieldCheck size={14} /><span>Your original dataset is never overwritten. All transformations are previewed and saved as a separate copy.</span><a href="#top" onClick={(e) => e.preventDefault()}>Data integrity <ArrowUpRight size={12} /></a></footer>
    </main>
  );
}

function CopyIcon({ size = 17 }) {
  return <Layers3 size={size} />;
}
function EyeIcon() {
  return <CircleHelp size={15} />;
}
function PreviewTable({ rows }) {
  if (!rows?.length) return <div className="clean-no-data">No records to display for this preview.</div>;
  const headers = Object.keys(rows[0]);
  return (
    <div className="clean-table-wrap clean-preview-table">
      <table className="clean-table">
        <thead><tr>{headers.map((head) => <th key={head}>{head}</th>)}</tr></thead>
        <tbody>{rows.slice(0, 20).map((row, index) => <tr key={index}>{headers.map((head) => <td key={head}>{row[head] == null ? <span className="clean-null">NULL</span> : String(row[head])}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
