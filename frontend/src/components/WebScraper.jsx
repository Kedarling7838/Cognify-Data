import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  Globe,
  Search,
  Save,
  RefreshCw,
  Link2,
  FileText,
  Heading,
  Table2,
  List,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  Database,
  Layers,
  Network,
  FileJson,
} from "lucide-react";

import "./WebScraper.css";

const API_BASE = `${window.location.protocol}//${window.location.hostname}:8000/api/datasets`;

const extractionOptions = [
  {
    value: "text",
    label: "Page text",
    icon: FileText,
    description: "Extract readable text lines",
  },
  {
    value: "headings",
    label: "Headings",
    icon: Heading,
    description: "Extract H1–H6 headings",
  },
  {
    value: "links",
    label: "Links",
    icon: Link2,
    description: "Extract link text and URLs",
  },
  {
    value: "tables",
    label: "Tables",
    icon: Table2,
    description: "Extract HTML table rows",
  },
];

export default function WebScraper() {
  const [url, setUrl] = useState("");
  const [extractionType, setExtractionType] = useState("text");
  const [selector, setSelector] = useState("");
  const [scrapeMode, setScrapeMode] = useState("single");
  const [maxPages, setMaxPages] = useState(5);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const records = result?.records || [];
  const columns = result?.columns || [];

  const previewRecords = useMemo(
    () => records.slice(0, 100),
    [records]
  );

  // ----------------------------------
  // RUN SCRAPING OR CRAWLING
  // ----------------------------------

  async function runExtraction(event) {
    event?.preventDefault();

    setError("");
    setNotice("");
    setResult(null);

    if (!url.trim()) {
      setError("Enter a website URL to continue.");
      return;
    }

    if (extractionType === "selector" && !selector.trim()) {
      setError("Enter a CSS selector, for example: article h2");
      return;
    }

    setLoading(true);

    try {
      const endpoint =
        scrapeMode === "crawl" ? "/crawl/" : "/scrape/";

      const payload = {
        url: url.trim(),
        extraction_type: extractionType,
        selector:
          extractionType === "selector" ? selector.trim() : "",
      };

      if (scrapeMode === "crawl") {
        payload.max_pages = Number(maxPages);
      }

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            data.detail ||
            "Unable to extract website data."
        );
      }

      setResult({
        ...data,
        mode: scrapeMode,
        extraction_type: extractionType,
      });

      const totalRows = Number(
        data.rows_count ??
          data.row_count ??
          data.records?.length ??
          0
      );

      if (scrapeMode === "crawl") {
        setNotice(
          `Crawled ${
            data.pages_crawled ?? data.pages?.length ?? 0
          } pages and extracted ${totalRows.toLocaleString()} records.`
        );
      } else {
        setNotice(
          `Extracted ${totalRows.toLocaleString()} records successfully.`
        );
      }
    } catch (err) {
      setError(
        err.message ||
          "Scraping failed. Check the URL and backend server."
      );
    } finally {
      setLoading(false);
    }
  }

  // ----------------------------------
  // DOWNLOAD HELPER
  // ----------------------------------

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], {
      type: mimeType,
    });

    const downloadUrl = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = downloadUrl;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(downloadUrl);
    }, 1000);
  }

  // ----------------------------------
  // EXPORT FILE NAME
  // ----------------------------------

  function getExportFilename(extension) {
    const baseName = (result?.title || "scraped_dataset")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);

    return `${baseName || "scraped_dataset"}.${extension}`;
  }

  // ----------------------------------
  // EXPORT CSV
  // ----------------------------------

  function exportCSV() {
    if (!records.length || !columns.length) return;

    const escapeCSV = (value) => {
      const text = String(value ?? "");
      return `"${text.replace(/"/g, '""')}"`;
    };

    const csvRows = [
      columns.map(escapeCSV).join(","),

      ...records.map((record) =>
        columns
          .map((column) => escapeCSV(record?.[column]))
          .join(",")
      ),
    ];

    downloadFile(
      "\uFEFF" + csvRows.join("\r\n"),
      getExportFilename("csv"),
      "text/csv;charset=utf-8;"
    );
  }

  // ----------------------------------
  // EXPORT JSON
  // ----------------------------------

  function exportJSON() {
    if (!records.length) return;

    const exportData = {
      title: result?.title || "Scraped Dataset",
      source_url: result?.url || url,
      extraction_type:
        result?.extraction_type || extractionType,
      total_records: records.length,
      columns,
      records,
    };

    downloadFile(
      JSON.stringify(exportData, null, 2),
      getExportFilename("json"),
      "application/json;charset=utf-8;"
    );
  }

  // ----------------------------------
  // EXPORT EXCEL
  // ----------------------------------

  function exportExcel() {
    if (!records.length || !columns.length) return;

    const worksheet = XLSX.utils.json_to_sheet(
      records.map((record) => {
        const row = {};

        columns.forEach((column) => {
          row[column] = record?.[column] ?? "";
        });

        return row;
      }),
      {
        header: columns,
      }
    );

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Scraped Data"
    );

    XLSX.writeFile(
      workbook,
      getExportFilename("xlsx")
    );
  }

  // ----------------------------------
  // SAVE DATASET TO DATABASE
  // ----------------------------------

  async function saveDataset() {
    if (!result || !records.length) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `${API_BASE}/scrape/save/`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: result.url || url.trim(),
            title: result.title || "Web scraped dataset",
            extraction_type:
              result.extraction_type || extractionType,
            columns,
            records,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            data.detail ||
            "Unable to save scraped data."
        );
      }

      setNotice(
        data.message ||
          "Scraped data saved to Dataset History."
      );
    } catch (err) {
      setError(
        err.message || "Could not save this dataset."
      );
    } finally {
      setSaving(false);
    }
  }

  // ----------------------------------
  // RESET SCRAPER
  // ----------------------------------

  function resetScraper() {
    setUrl("");
    setSelector("");
    setResult(null);
    setError("");
    setNotice("");
    setMaxPages(5);
  }

  // ----------------------------------
  // CHANGE SCRAPING MODE
  // ----------------------------------

  function changeMode(mode) {
    setScrapeMode(mode);
    setResult(null);
    setError("");
    setNotice("");
  }

  const totalRows = Number(
    result?.rows_count ??
      result?.row_count ??
      records.length
  );

  // ----------------------------------
  // COMPONENT UI
  // ----------------------------------

  return (
    <div className="scraper-page">

      {/* PAGE HEADER */}

      <div className="scraper-heading">
        <div>
          <div className="scraper-eyebrow">
            <span />
            DATA ACQUISITION TOOL
          </div>

          <h1>Web Scraping</h1>

          <p>
            Collect structured information from public web pages
            and bring it into your workspace.
          </p>
        </div>

        <div className="scraper-heading-icon">
          <Globe size={28} />
        </div>
      </div>

      {/* CONFIGURATION PANEL */}

      <section className="scraper-panel scraper-form-panel">

        <div className="scraper-panel-title">
          <div className="scraper-title-icon">
            <Search size={18} />
          </div>

          <div>
            <h2>Configure extraction</h2>

            <p>
              Enter a public website URL and choose the content
              to collect.
            </p>
          </div>
        </div>

        <form onSubmit={runExtraction}>

          {/* SCRAPING MODE */}

          <label className="scraper-label">
            Extraction mode
          </label>

          <div className="scraper-mode-options">

            <button
              type="button"
              className={`scraper-mode-card ${
                scrapeMode === "single" ? "selected" : ""
              }`}
              onClick={() => changeMode("single")}
            >
              <Globe size={21} />

              <div>
                <strong>Single Page</strong>
                <small>
                  Extract content from one webpage.
                </small>
              </div>
            </button>

            <button
              type="button"
              className={`scraper-mode-card ${
                scrapeMode === "crawl" ? "selected" : ""
              }`}
              onClick={() => changeMode("crawl")}
            >
              <Network size={21} />

              <div>
                <strong>Multi-Page Crawl</strong>
                <small>
                  Discover and extract same-domain pages.
                </small>
              </div>
            </button>

          </div>

          {/* WEBSITE URL */}

          <label
            className="scraper-label"
            htmlFor="scrape-url"
          >
            Website URL
          </label>

          <div className="scraper-url-field">
            <Globe size={18} />

            <input
              id="scrape-url"
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(event) =>
                setUrl(event.target.value)
              }
              required
            />
          </div>

          {/* CRAWL SETTINGS */}

          {scrapeMode === "crawl" && (
            <div className="scraper-crawl-settings">

              <div>
                <strong>
                  <Layers size={16} />
                  Crawl settings
                </strong>

                <p>
                  The crawler discovers links and visits pages
                  on the same hostname.
                </p>
              </div>

              <div className="scraper-page-limit">
                <label htmlFor="crawl-page-limit">
                  Maximum pages
                </label>

                <select
                  id="crawl-page-limit"
                  value={maxPages}
                  onChange={(event) =>
                    setMaxPages(Number(event.target.value))
                  }
                >
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(
                    (number) => (
                      <option
                        key={number}
                        value={number}
                      >
                        {number} pages
                      </option>
                    )
                  )}
                </select>
              </div>

            </div>
          )}

          {/* EXTRACTION TYPE */}

          <label className="scraper-label">
            Extraction type
          </label>

          <div className="scraper-options">

            {extractionOptions.map(
              ({ value, label, icon: Icon, description }) => (
                <button
                  type="button"
                  key={value}
                  className={`scraper-option ${
                    extractionType === value
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    setExtractionType(value)
                  }
                >
                  <Icon size={19} />

                  <strong>{label}</strong>

                  <small>{description}</small>
                </button>
              )
            )}

            <button
              type="button"
              className={`scraper-option ${
                extractionType === "selector"
                  ? "selected"
                  : ""
              }`}
              onClick={() =>
                setExtractionType("selector")
              }
            >
              <List size={19} />

              <strong>CSS selector</strong>

              <small>
                Target matching page elements
              </small>
            </button>

          </div>

          {/* CSS SELECTOR */}

          {extractionType === "selector" && (
            <div className="scraper-selector-field">

              <label
                className="scraper-label"
                htmlFor="scrape-selector"
              >
                CSS selector
              </label>

              <input
                id="scrape-selector"
                type="text"
                placeholder="e.g. article h2, .product-card, main p"
                value={selector}
                onChange={(event) =>
                  setSelector(event.target.value)
                }
              />

            </div>
          )}

          {/* ACTION BUTTONS */}

          <div className="scraper-actions">

            <button
              type="button"
              className="scraper-reset-button"
              onClick={resetScraper}
            >
              Reset
            </button>

            <button
              type="submit"
              className="scraper-primary-button"
              disabled={loading}
            >
              {loading ? (
                <>
                  <LoaderCircle
                    className="scraper-spin"
                    size={17}
                  />

                  {scrapeMode === "crawl"
                    ? "Crawling..."
                    : "Extracting..."}
                </>
              ) : (
                <>
                  {scrapeMode === "crawl" ? (
                    <Network size={17} />
                  ) : (
                    <Search size={17} />
                  )}

                  {scrapeMode === "crawl"
                    ? "Start crawling"
                    : "Extract data"}
                </>
              )}
            </button>

          </div>
        </form>
      </section>

      {/* SUCCESS AND ERROR MESSAGES */}

      {(error || notice) && (
        <div
          className={`scraper-message ${
            error ? "is-error" : "is-success"
          }`}
          role="status"
        >
          {error ? (
            <AlertCircle size={18} />
          ) : (
            <CheckCircle2 size={18} />
          )}

          <span>{error || notice}</span>
        </div>
      )}

      {/* RESULTS SECTION */}

      {result && (
        <section className="scraper-results">

          {/* RESULTS HEADER */}

          <div className="scraper-results-top">

            <div>
              <div className="scraper-eyebrow">
                {result.mode === "crawl"
                  ? "CRAWL COMPLETE"
                  : "EXTRACTION COMPLETE"}
              </div>

              <h2>
                {result.title || "Scraped webpage"}
              </h2>

              <a
                href={result.url || url}
                target="_blank"
                rel="noreferrer"
              >
                {result.url || url}
              </a>
            </div>

            {/* RESULT ACTIONS */}

            <div className="scraper-result-actions">

              <button
                type="button"
                className="scraper-reset-button"
                onClick={() => runExtraction()}
                disabled={loading}
              >
                <RefreshCw size={16} />
                Re-run
              </button>

              <button
                type="button"
                className="scraper-export-button"
                onClick={exportCSV}
                disabled={!records.length}
              >
                <FileText size={16} />
                CSV
              </button>

              <button
                type="button"
                className="scraper-export-button"
                onClick={exportJSON}
                disabled={!records.length}
              >
                <FileJson size={16} />
                JSON
              </button>

              <button
                type="button"
                className="scraper-export-button"
                onClick={exportExcel}
                disabled={!records.length}
              >
                <Table2 size={16} />
                Excel
              </button>

              <button
                type="button"
                className="scraper-primary-button"
                onClick={saveDataset}
                disabled={saving || !records.length}
              >
                {saving ? (
                  <>
                    <LoaderCircle
                      className="scraper-spin"
                      size={17}
                    />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={17} />
                    Save dataset
                  </>
                )}
              </button>

            </div>
          </div>

          {/* SUMMARY CARDS */}

          <div className="scraper-summary-grid">

            <article>
              <span>Records extracted</span>
              <strong>
                {totalRows.toLocaleString()}
              </strong>
            </article>

            <article>
              <span>Columns</span>
              <strong>{columns.length}</strong>
            </article>

            <article>
              <span>
                {result.mode === "crawl"
                  ? "Pages crawled"
                  : "Preview rows"}
              </span>

              <strong>
                {result.mode === "crawl"
                  ? result.pages_crawled ??
                    result.pages?.length ??
                    0
                  : previewRecords.length}
              </strong>
            </article>

          </div>

          {/* CRAWLED PAGE DETAILS */}

          {result.mode === "crawl" && (
            <div className="scraper-panel scraper-crawl-results">

              <h3>
                <Network size={18} />
                Crawled pages
              </h3>

              {result.pages?.length ? (
                <div className="scraper-crawled-list">

                  {result.pages.map((page, index) => {
                    const pageUrl =
                      typeof page === "string"
                        ? page
                        : page.url;

                    return (
                      <div
                        className="scraper-crawled-item"
                        key={`${pageUrl}-${index}`}
                      >
                        <CheckCircle2 size={16} />

                        <a
                          href={pageUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {pageUrl}
                        </a>
                      </div>
                    );
                  })}

                </div>
              ) : (
                <p className="scraper-crawl-note">
                  The backend did not return individual
                  page details.
                </p>
              )}

              {/* CRAWL ERRORS */}

              {result.errors?.length > 0 && (
                <div className="scraper-crawl-errors">

                  <strong>
                    <AlertCircle size={16} />
                    Some pages could not be extracted
                  </strong>

                  {result.errors.map((item, index) => (
                    <p key={index}>
                      {typeof item === "string"
                        ? item
                        : `${
                            item.url || "Page"
                          }: ${
                            item.error ||
                            item.message ||
                            "Extraction failed"
                          }`}
                    </p>
                  ))}

                </div>
              )}

              {result.truncated && (
                <p className="scraper-crawl-note">
                  The result was limited by the maximum
                  record limit.
                </p>
              )}

            </div>
          )}

          {/* DATA PREVIEW */}

          <div className="scraper-panel scraper-preview-panel">

            <div className="scraper-preview-heading">

              <div>
                <h3>
                  <Database size={18} />
                  Data preview
                </h3>

                <p>
                  Showing up to the first 100 extracted records.
                </p>
              </div>

              <span>
                {totalRows.toLocaleString()} total rows
              </span>

            </div>

            {previewRecords.length ? (
              <div className="scraper-table-wrap">

                <table className="scraper-table">

                  <thead>
                    <tr>
                      {columns.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {previewRecords.map((record, index) => (
                      <tr key={index}>
                        {columns.map((column) => (
                          <td key={column}>
                            {String(
                              record?.[column] ?? ""
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>

                </table>
              </div>
            ) : (
              <div className="scraper-empty">
                No records were returned for this extraction type.
              </div>
            )}

          </div>
        </section>
      )}

      {/* DISCLAIMER */}

      <p className="scraper-disclaimer">
        Use this tool only on public pages you are permitted
        to access. Respect website terms, robots.txt rules,
        copyright, and rate limits.
      </p>

    </div>
  );
}