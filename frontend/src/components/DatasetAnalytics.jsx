import { useEffect, useMemo, useState } from "react";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

import {
  AlertCircle,
  ChartNoAxesCombined,
  RefreshCw,
  Database,
  Rows3,
  Columns3,
  Hash,
  FileSpreadsheet,
  Download,
  ShieldCheck,
  AlertTriangle,
  Copy,
  Activity,
} from "lucide-react";

import {
  getDatasetHistory,
  getDatasetAnalytics,
} from "../services/api";

const formatNumber = (value, digits = 2) => {
  if (value === null || value === undefined || value === "") return "—";

  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);

  return number.toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
};

const formatPercent = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)}%` : "—";
};

const safeArray = (value) => (Array.isArray(value) ? value : []);
const safeObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

function StatCard({ icon: Icon, label, value, note }) {
  return (
    <div className="dataset-stat">
      <div className="analytics-stat-icon">
        <Icon size={19} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

function SectionHeading({ title, description, action }) {
  return (
    <div className="analytics-section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

function EmptyMessage({ children }) {
  return <div className="analytics-empty">{children}</div>;
}

export default function DatasetAnalytics({ initialDatasetId }) {
  const [datasets, setDatasets] = useState([]);
  const [selectedId, setSelectedId] = useState(
    initialDatasetId !== null && initialDatasetId !== undefined
      ? String(initialDatasetId)
      : ""
  );

  const [analytics, setAnalytics] = useState(null);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load the user's dataset history.
  useEffect(() => {
    let cancelled = false;

    async function loadDatasets() {
      setLoadingDatasets(true);
      setError("");

      try {
        const items = await getDatasetHistory();
        if (cancelled) return;

        const safeItems = Array.isArray(items) ? items : [];
        setDatasets(safeItems);

        const requestedId =
          initialDatasetId !== null && initialDatasetId !== undefined
            ? String(initialDatasetId)
            : "";

        const requestedExists = safeItems.some(
          (item) => String(item.id) === requestedId
        );

        setSelectedId((currentId) => {
          if (requestedExists) return requestedId;

          const currentExists = safeItems.some(
            (item) => String(item.id) === String(currentId)
          );

          if (currentId && currentExists) return String(currentId);

          return safeItems.length ? String(safeItems[0].id) : "";
        });
      } catch (err) {
        if (!cancelled) {
          setDatasets([]);
          setError(err.message || "Unable to load dataset history.");
        }
      } finally {
        if (!cancelled) setLoadingDatasets(false);
      }
    }

    loadDatasets();

    return () => {
      cancelled = true;
    };
  }, [initialDatasetId]);

  // Fetch analytics whenever the selected dataset changes.
  useEffect(() => {
    let cancelled = false;

    async function loadAnalytics() {
      if (!selectedId) {
        setAnalytics(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      setAnalytics(null);

      try {
        const result = await getDatasetAnalytics(selectedId);
        if (!cancelled) setAnalytics(result);
      } catch (err) {
        if (!cancelled) {
          setAnalytics(null);
          setError(err.message || "Unable to load dataset analytics.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAnalytics();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function handleRefresh() {
    setLoadingDatasets(true);
    setError("");

    try {
      const items = await getDatasetHistory();
      const safeItems = Array.isArray(items) ? items : [];
      setDatasets(safeItems);

      const currentExists = safeItems.some(
        (item) => String(item.id) === String(selectedId)
      );

      const nextId = currentExists
        ? String(selectedId)
        : safeItems.length
        ? String(safeItems[0].id)
        : "";

      setSelectedId(nextId);

      if (nextId) {
        setLoading(true);
        try {
          const result = await getDatasetAnalytics(nextId);
          setAnalytics(result);
        } catch (err) {
          setAnalytics(null);
          setError(err.message || "Unable to load dataset analytics.");
        } finally {
          setLoading(false);
        }
      } else {
        setAnalytics(null);
      }
    } catch (err) {
      setError(err.message || "Unable to refresh dataset history.");
    } finally {
      setLoadingDatasets(false);
    }
  }

  const numericSummary = safeObject(analytics?.numeric_summary);
  const categorySummary = safeObject(analytics?.category_summary);
  const columnProfiles = safeObject(analytics?.column_profiles);
  const missingByColumn = safeObject(analytics?.missing_by_column);
  const outlierSummary = safeObject(analytics?.outlier_summary);
  const correlation = safeObject(analytics?.correlation);
  const insights = safeArray(analytics?.insights);

  const numericEntries = Object.entries(numericSummary);
  const categoryEntries = Object.entries(categorySummary);
  const profileEntries = Object.entries(columnProfiles);
  const outlierEntries = Object.entries(outlierSummary);
  const correlationColumns = Object.keys(correlation);

  const qualityScore = Number(analytics?.quality_score);
  const hasQualityScore =
    analytics?.quality_score !== null &&
    analytics?.quality_score !== undefined &&
    Number.isFinite(qualityScore);

  const missingEntries = Object.entries(missingByColumn).sort(
    (a, b) => Number(b[1]?.count ?? b[1] ?? 0) - Number(a[1]?.count ?? a[1] ?? 0)
  );

  const chartTooltipStyle = {
    backgroundColor: "#211719",
    border: "1px solid #60313a",
    borderRadius: 8,
    color: "#f7f0f1",
  };

  const qualityColor =
    !hasQualityScore || qualityScore >= 80
      ? "#2e9d70"
      : qualityScore >= 60
      ? "#d49b3f"
      : "#d45b62";

  

  const exportAnalytics = () => {
    if (!analytics) return;

    const blob = new Blob([JSON.stringify(analytics, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const baseName = (analytics.filename || "dataset")
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-z0-9-_]+/gi, "_");

    link.href = url;
    link.download = `${baseName}_analytics.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const summaryCards = useMemo(
    () => [
      {
        icon: Rows3,
        label: "Total Rows",
        value: formatNumber(analytics?.rows),
        note: "Complete dataset",
      },
      {
        icon: Columns3,
        label: "Total Columns",
        value: formatNumber(analytics?.columns_count),
        note: "Available fields",
      },
      {
        icon: Hash,
        label: "Numeric Columns",
        value: formatNumber(safeArray(analytics?.numeric_columns).length),
        note: "Statistical analysis",
      },
      {
        icon: Database,
        label: "Categorical Columns",
        value: formatNumber(safeArray(analytics?.categorical_columns).length),
        note: "Distribution analysis",
      },
    ],
    [analytics]
  );

  return (
    <section className="upload-workspace analytics-workspace">
      <div className="upload-heading history-heading">
        <div>
          <span className="eyebrow">DATA INTELLIGENCE</span>
          <h1>Dataset Analytics</h1>
          <p>
            Explore dataset profiles, statistics, data quality, outliers,
            category distributions and correlations.
          </p>
        </div>

        <div className="analytics-header-actions">
          {analytics && (
            <button
              type="button"
              className="secondary-button"
              onClick={exportAnalytics}
            >
              <Download size={16} />
              Export report
            </button>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={handleRefresh}
            disabled={loadingDatasets || loading}
          >
            <RefreshCw
              size={16}
              className={loadingDatasets || loading ? "spin-icon" : ""}
            />
            Refresh
          </button>
        </div>
      </div>

      <div className="panel analytics-selector-panel">
        <label htmlFor="analytics-dataset">Select dataset</label>
        <select
          id="analytics-dataset"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          disabled={loadingDatasets || datasets.length === 0}
        >
          <option value="">Choose a dataset</option>
          {datasets.map((dataset) => (
            <option key={dataset.id} value={String(dataset.id)}>
              {dataset.filename}
            </option>
          ))}
        </select>

        {analytics && (
          <div className="analytics-selected-file">
            <FileSpreadsheet size={16} />
            <span>{analytics.filename}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="upload-message error-message" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {loadingDatasets && (
        <div className="analytics-loading">
          <RefreshCw size={22} className="spin-icon" />
          <p>Loading your datasets...</p>
        </div>
      )}

      {!loadingDatasets &&
        !loading &&
        !error &&
        datasets.length === 0 && (
          <div className="upload-dropzone">
            <ChartNoAxesCombined size={36} />
            <h3>No datasets available</h3>
            <p>
              Upload a CSV, Excel or JSON dataset, or import a database table
              from Data Sources to explore its analytics.
            </p>
          </div>
        )}

      {loading && (
        <div className="analytics-loading">
          <RefreshCw size={22} className="spin-icon" />
          <p>Analyzing all rows in your dataset...</p>
        </div>
      )}

      {analytics && !loading && (
        <>
          {/* Main dataset statistics */}
          <div className="dataset-stats analytics-stats">
            {summaryCards.map((item) => (
              <StatCard key={item.label} {...item} />
            ))}
          </div>

          {/* Quality score and data-quality checks */}
          <div className="analytics-quality-grid">
            <div className="panel analytics-quality-card analytics-score-card">
              <div className="analytics-quality-title">
                <ShieldCheck size={19} />
                <span>Data Quality Score</span>
              </div>
              <strong style={{ color: qualityColor }}>
                {hasQualityScore ? `${qualityScore.toFixed(1)}%` : "—"}
              </strong>
              <div className="analytics-quality-track">
                <div
                  className="analytics-quality-fill"
                  style={{
                    width: `${hasQualityScore ? Math.max(0, Math.min(100, qualityScore)) : 0}%`,
                    background: qualityColor,
                  }}
                />
              </div>
              <p>
                Estimated score based on missing values and duplicate rows.
              </p>
            </div>

            <div className="panel analytics-quality-card">
              <span>Missing Values</span>
              <strong>{formatNumber(analytics.missing_values)}</strong>
              <p>Empty cells across the dataset</p>
            </div>

            <div className="panel analytics-quality-card">
              <span>Duplicate Rows</span>
              <strong>{formatNumber(analytics.duplicate_rows)}</strong>
              <p>Repeated complete rows</p>
            </div>

            <div className="panel analytics-quality-card">
              <span>Total Cells</span>
              <strong>{formatNumber(analytics.total_cells)}</strong>
              <p>Rows multiplied by columns</p>
            </div>
          </div>

          {/* Automated insights */}
          {insights.length > 0 && (
            <div className="panel analytics-content-panel">
              <SectionHeading
                title="Dataset Insights"
                description="Highlights generated from the dataset profile and quality checks."
              />
              <div className="analytics-insights-list">
                {insights.map((insight, index) => (
                  <div className="analytics-insight-item" key={`${index}-${insight}`}>
                    <Activity size={17} />
                    <span>
                      {typeof insight === "string"
                        ? insight
                        : insight.message || insight.text || JSON.stringify(insight)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Column profile */}
          <div className="panel analytics-content-panel">
            <SectionHeading
              title="Column Profiles"
              description="Data type, unique values and missing-value information for each column."
            />

            {profileEntries.length === 0 ? (
              <EmptyMessage>
                Column profile information is not available. Confirm that the
                updated analytics API is running.
              </EmptyMessage>
            ) : (
              <div className="preview-table-wrapper">
                <table className="preview-table analytics-table">
                  <thead>
                    <tr>
                      <th>Column</th>
                      <th>Data Type</th>
                      <th>Unique Values</th>
                      <th>Missing</th>
                      <th>Missing %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profileEntries.map(([column, profile]) => (
                      <tr key={column}>
                        <td>{column}</td>
                        <td>{profile?.dtype ?? "—"}</td>
                        <td>{formatNumber(profile?.unique)}</td>
                        <td>{formatNumber(profile?.missing)}</td>
                        <td>{formatPercent(profile?.missing_percentage)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Missing values by column */}
          <div className="panel analytics-content-panel">
            <SectionHeading
              title="Missing Values by Column"
              description="Columns with the highest number of empty values appear first."
            />

            {missingEntries.length === 0 ? (
              <EmptyMessage>
                No per-column missing-value information is available.
              </EmptyMessage>
            ) : (
              <div className="preview-table-wrapper">
                <table className="preview-table analytics-table">
                  <thead>
                    <tr>
                      <th>Column</th>
                      <th>Missing Values</th>
                      <th>Missing %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingEntries.map(([column, details]) => {
                      const count =
                        typeof details === "object"
                          ? details?.count ?? details?.missing ?? 0
                          : details;
                      const percentage =
                        typeof details === "object"
                          ? details?.percentage ?? details?.missing_percentage
                          : null;

                      return (
                        <tr key={column}>
                          <td>{column}</td>
                          <td>{formatNumber(count)}</td>
                          <td>{formatPercent(percentage)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Numeric summary */}
          <div className="panel analytics-content-panel">
            <SectionHeading
              title="Numeric Column Summary"
              description="Statistical measures calculated from all available rows."
            />

            {numericEntries.length === 0 ? (
              <EmptyMessage>
                No numeric columns were identified in this dataset.
              </EmptyMessage>
            ) : (
              <div className="preview-table-wrapper">
                <table className="preview-table analytics-table">
                  <thead>
                    <tr>
                      <th>Column</th>
                      <th>Count</th>
                      <th>Mean</th>
                      <th>Median</th>
                      <th>Std. Deviation</th>
                      <th>Minimum</th>
                      <th>Maximum</th>
                      <th>Sum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {numericEntries.map(([column, stats]) => (
                      <tr key={column}>
                        <td>{column}</td>
                        <td>{formatNumber(stats?.count)}</td>
                        <td>{formatNumber(stats?.mean)}</td>
                        <td>{formatNumber(stats?.median)}</td>
                        <td>{formatNumber(stats?.std)}</td>
                        <td>{formatNumber(stats?.min)}</td>
                        <td>{formatNumber(stats?.max)}</td>
                        <td>{formatNumber(stats?.sum)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Outlier analysis */}
          <div className="panel analytics-content-panel">
            <SectionHeading
              title="Outlier Analysis"
              description="Potential numeric outliers identified using the interquartile range (IQR) method."
            />

            {outlierEntries.length === 0 ? (
              <EmptyMessage>
                Outlier analysis is not available for this dataset.
              </EmptyMessage>
            ) : (
              <div className="preview-table-wrapper">
                <table className="preview-table analytics-table">
                  <thead>
                    <tr>
                      <th>Column</th>
                      <th>Outlier Count</th>
                      <th>Outlier %</th>
                      <th>Lower Bound</th>
                      <th>Upper Bound</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outlierEntries.map(([column, details]) => (
                      <tr key={column}>
                        <td>{column}</td>
                        <td>{formatNumber(details?.count)}</td>
                        <td>{formatPercent(details?.percentage)}</td>
                        <td>{formatNumber(details?.lower_bound)}</td>
                        <td>{formatNumber(details?.upper_bound)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Category distributions */}
          <div className="panel analytics-content-panel">
            <SectionHeading
              title="Category Distributions"
              description="Top categories and their record counts for each categorical column."
            />

            {categoryEntries.length === 0 ? (
              <EmptyMessage>
                No categorical columns were identified in this dataset.
              </EmptyMessage>
            ) : (
              <div className="analytics-category-grid">
                {categoryEntries.map(([column, categories]) => {
                  const safeCategories = safeArray(categories);
                  const chartData = safeCategories.map((item) => ({
                    name: String(item?.category ?? "(Empty)"),
                    count: Number(item?.count) || 0,
                  }));

                  return (
                    <div
                      className="panel analytics-category-card"
                      key={column}
                    >
                      <h3>{column}</h3>
                      <p>Top 10 category values</p>

                      {chartData.length === 0 ? (
                        <EmptyMessage>No category values available.</EmptyMessage>
                      ) : (
                        <div className="analytics-chart">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={chartData}
                              margin={{
                                top: 10,
                                right: 10,
                                left: -15,
                                bottom: 45,
                              }}
                            >
                              <CartesianGrid
                                stroke="#38272b"
                                vertical={false}
                              />
                              <XAxis
                                dataKey="name"
                                interval={0}
                                angle={-30}
                                textAnchor="end"
                                height={75}
                                tick={{ fill: "#bcaeb1", fontSize: 10 }}
                              />
                              <YAxis
                                allowDecimals={false}
                                tick={{ fill: "#bcaeb1", fontSize: 11 }}
                              />
                              <Tooltip
                                contentStyle={chartTooltipStyle}
                                formatter={(value) => [
                                  formatNumber(value),
                                  "Records",
                                ]}
                              />
                              <Bar
                                dataKey="count"
                                name="Records"
                                fill="#922e40"
                                radius={[5, 5, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Correlation matrix */}
          <div className="panel analytics-content-panel">
            <SectionHeading
              title="Correlation Matrix"
              description="Pearson correlation values between numeric columns. Values closer to 1 or -1 indicate stronger linear relationships."
            />

            {correlationColumns.length < 2 ? (
              <EmptyMessage>
                Correlation analysis requires at least two numeric columns.
              </EmptyMessage>
            ) : (
              <div className="preview-table-wrapper">
                <table className="preview-table analytics-table">
                  <thead>
                    <tr>
                      <th>Column</th>
                      {correlationColumns.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {correlationColumns.map((rowName) => (
                      <tr key={rowName}>
                        <td>{rowName}</td>
                        {correlationColumns.map((column) => (
                          <td key={`${rowName}-${column}`}>
                            {formatNumber(
                              correlation?.[rowName]?.[column]
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="demo-note analytics-note">
            Analytics are calculated from the stored original dataset when
            available. The quality score is an estimate based on missing
            values and duplicate rows, not a formal certification. Older
            datasets without a stored original file may need to be uploaded
            again for complete analysis.
          </p>
        </>
      )}
    </section>
  );
}
