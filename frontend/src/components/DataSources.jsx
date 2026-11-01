
import { useEffect, useState } from "react";
import {
  Database, Server, Cloud, Upload, Search, RefreshCw,
  CheckCircle2, AlertCircle, X, Eye, EyeOff, Table2,
  Download, Trash2, BarChart3, Clock, ShieldCheck,
  ArrowRight, Plus, Layers, HardDrive, Code2,
  ChevronRight, Activity, Plug, FileSpreadsheet,
  Rows3, Columns3, Settings2, LockKeyhole
} from "lucide-react";

import {
  getDatasetHistory,
  deleteDataset
} from "../services/api";

import "./DataSources.css";

const API_BASE = "http://localhost:8000/api/datasets";

const DATABASES = [
  {
    id: "mysql",
    name: "MySQL",
    category: "SQL DATABASE",
    description: "Connect relational databases and import structured data.",
    icon: Database,
    color: "mysql",
    active: true,
    version: "MySQL 5.7+"
  },
  {
    id: "oracle",
    name: "Oracle",
    category: "ENTERPRISE SQL",
    description: "Connect Oracle databases and explore enterprise data.",
    icon: Database,
    color: "oracle",
    active: true,
    version: "Oracle XE / 11g+"
  },
  {
    id: "postgresql",
    name: "PostgreSQL",
    category: "SQL DATABASE",
    description: "Connect local, remote and cloud PostgreSQL databases.",
    icon: Database,
    color: "postgres",
    active: true,
    version: "PostgreSQL 12+"
  },
  {
    id: "mongodb",
    name: "MongoDB",
    category: "NOSQL DATABASE",
    description: "Connect MongoDB Atlas and import flexible JSON documents.",
    icon: Layers,
    color: "mongo",
    active: true,
    version: "MongoDB Atlas"
  },
  {
    id: "sqlite",
    name: "SQLite",
    category: "LOCAL DATABASE",
    description: "Connect lightweight local database files.",
    icon: HardDrive,
    color: "sqlite",
    active: true,
    version: "Python sqlite3"
  },
  {
    id: "sqlserver",
    name: "SQL Server",
    category: "ENTERPRISE SQL",
    description: "Integrate Microsoft SQL Server data sources.",
    icon: Server,
    color: "sqlserver",
    active: true,
    version: "SQL Server 2012+"
  }
];

const MYSQL_INITIAL = {
  host: "127.0.0.1",
  port: "3306",
  database: "cognify_test",
  username: "",
  password: ""
};

const ORACLE_INITIAL = {
  host: "127.0.0.1",
  port: "1521",
  service_name: "XE",
  username: "",
  password: ""
};

const SQLITE_INITIAL = {
  database_file: "students.db"
};

const POSTGRESQL_INITIAL = {
  host: "127.0.0.1",
  port: "5432",
  database: "cognify",
  schema: "public",
  username: "",
  password: ""
};

const MONGODB_INITIAL = {
  connection_string: "",
  database: "cognify_data"
};

const SQLSERVER_INITIAL = {
  host: "localhost",
  port: "1433",
  database: "",
  schema: "dbo",
  username: "",
  password: "",
  driver: "ODBC Driver 18 for SQL Server"
};

export default function DataSources({ onUpload, onAnalytics }) {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  const [selectedDatabase, setSelectedDatabase] = useState("mysql");
  const [showConnection, setShowConnection] = useState(false);

  const [mysql, setMysql] = useState(MYSQL_INITIAL);
  const [oracle, setOracle] = useState(ORACLE_INITIAL);
  const [sqlite, setSqlite] = useState(SQLITE_INITIAL);
  const [postgresql, setPostgresql] = useState(POSTGRESQL_INITIAL);
  const [mongodb, setMongodb] = useState(MONGODB_INITIAL);
  const [sqlserver, setSqlserver] = useState(SQLSERVER_INITIAL);

  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const [connectionResult, setConnectionResult] = useState(null);
  const [selectedTable, setSelectedTable] = useState("");
  const [previewData, setPreviewData] = useState(null);
  const [importedResult, setImportedResult] = useState(null);

  const [connectionError, setConnectionError] = useState("");
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");

  const isOracle = selectedDatabase === "oracle";
  const isSQLite = selectedDatabase === "sqlite";
  const isPostgreSQL = selectedDatabase === "postgresql";
  const isMongoDB = selectedDatabase === "mongodb";
  const isSQLServer = selectedDatabase === "sqlserver";

  const currentDatabase = DATABASES.find(
    (db) => db.id === selectedDatabase
  );

  const CurrentDatabaseIcon = currentDatabase?.icon || Database;

  const totalRows = datasets.reduce(
    (sum, item) =>
      sum + Number(item.rows_count ?? item.rows ?? 0),
    0
  );

  const totalColumns = datasets.reduce(
    (sum, item) =>
      sum + Number(item.columns_count ?? 0),
    0
  );

  const filteredDatasets = datasets.filter((item) =>
    String(item.filename || "")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  async function loadDatasets() {
    setLoading(true);
    setPageError("");

    try {
      const result = await getDatasetHistory();
      setDatasets(Array.isArray(result) ? result : []);
    } catch (error) {
      setPageError(error.message || "Unable to load datasets.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDatasets();
  }, []);

  function clearConnectionResults() {
    setConnectionError("");
    setConnectionResult(null);
    setSelectedTable("");
    setPreviewData(null);
    setImportedResult(null);
  }

  function handleMysqlChange(event) {
    const { name, value } = event.target;

    setMysql((current) => ({
      ...current,
      [name]: value
    }));

    clearConnectionResults();
  }

  function handleOracleChange(event) {
    const { name, value } = event.target;

    setOracle((current) => ({
      ...current,
      [name]: value
    }));

    clearConnectionResults();
  }

  function handleSQLiteChange(event) {
    const { name, value } = event.target;

    setSqlite((current) => ({
      ...current,
      [name]: value
    }));

    clearConnectionResults();
  }

  function handlePostgreSQLChange(event) {
    const { name, value } = event.target;

    setPostgresql((current) => ({
      ...current,
      [name]: value
    }));

    clearConnectionResults();
  }

  function handleMongoDBChange(event) {
    const { name, value } = event.target;

    setMongodb((current) => ({
      ...current,
      [name]: value
    }));

    clearConnectionResults();
  }

  function handleSQLServerChange(event) {
    const { name, value } = event.target;

    setSqlserver((current) => ({
      ...current,
      [name]: value
    }));

    clearConnectionResults();
  }

  function getPayload() {
    if (isSQLServer) {
      return {
        host: sqlserver.host.trim(),
        port: Number(sqlserver.port),
        database: sqlserver.database.trim(),
        schema: sqlserver.schema.trim() || "dbo",
        username: sqlserver.username.trim(),
        password: sqlserver.password,
        driver: sqlserver.driver.trim()
      };
    }

    if (isMongoDB) {
      return {
        connection_string: mongodb.connection_string.trim(),
        database: mongodb.database.trim()
      };
    }

    if (isSQLite) {
      return {
        database_file: sqlite.database_file.trim()
      };
    }

    if (isPostgreSQL) {
      return {
        host: postgresql.host.trim(),
        port: Number(postgresql.port),
        database: postgresql.database.trim(),
        schema: postgresql.schema.trim() || "public",
        username: postgresql.username.trim(),
        password: postgresql.password
      };
    }

    if (isOracle) {
      return {
        host: oracle.host.trim(),
        port: Number(oracle.port),
        service_name: oracle.service_name.trim(),
        username: oracle.username.trim(),
        password: oracle.password
      };
    }

    return {
      host: mysql.host.trim(),
      port: Number(mysql.port),
      database: mysql.database.trim(),
      username: mysql.username.trim(),
      password: mysql.password
    };
  }

  async function apiRequest(endpoint, payload) {
    // Read the Django CSRF cookie for session-authenticated POST requests.
    const csrfToken = document.cookie
      .split("; ")
      .find((row) => row.startsWith("csrftoken="))
      ?.split("=")[1];

    const response = await fetch(`${API_BASE}/${endpoint}/`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        ...(csrfToken
          ? { "X-CSRFToken": decodeURIComponent(csrfToken) }
          : {}),
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let result;

    try {
      result = JSON.parse(text);
    } catch {
      throw new Error("Invalid server response. Check the Django backend.");
    }

    if (!response.ok) {
      throw new Error(
        result.message ||
        result.error ||
        result.detail ||
        `Request failed (${response.status}).`
      );
    }

    return result;
  }

  function openConnection(database) {
    if (!database.active) {
      setNotice(
        `${database.name} integration is planned. Its backend connector is not implemented yet.`
      );
      return;
    }

    setSelectedDatabase(database.id);
    clearConnectionResults();
    setConnectionError("");
    setNotice("");
    setShowPassword(false);
    setShowConnection(true);
  }

  function closeConnection() {
    if (testing || previewLoading || importing) return;

    setShowConnection(false);
    clearConnectionResults();
    setConnectionError("");
    setShowPassword(false);

    setMysql((current) => ({
      ...current,
      password: ""
    }));

    setOracle((current) => ({
      ...current,
      password: ""
    }));

    setPostgresql((current) => ({
      ...current,
      password: ""
    }));

    setMongodb((current) => ({
      ...current,
      connection_string: ""
    }));

    setSqlserver((current) => ({
      ...current,
      password: ""
    }));
  }

  async function testConnection(event) {
    event.preventDefault();

    setTesting(true);
    clearConnectionResults();

    try {
      const endpoint = isSQLServer
        ? "connect-sqlserver"
        : isMongoDB
          ? "connect-mongodb"
        : isSQLite
          ? "connect-sqlite"
          : isPostgreSQL
            ? "connect-postgresql"
            : isOracle
              ? "connect-oracle"
              : "connect-mysql";

      const result = await apiRequest(endpoint, getPayload());

      const normalizedResult = isMongoDB
        ? {
            ...result,
            tables: result.collections || []
          }
        : result;

      setConnectionResult(normalizedResult);

      if (normalizedResult.tables?.length) {
        setSelectedTable(normalizedResult.tables[0]);
      }
    } catch (error) {
      setConnectionError(
        error.message || "Database connection failed."
      );
    } finally {
      setTesting(false);
    }
  }

  async function previewTable() {
    if (!selectedTable) {
      setConnectionError("Please select a table.");
      return;
    }

    setPreviewLoading(true);
    setConnectionError("");
    setPreviewData(null);
    setImportedResult(null);

    try {
      const endpoint = isSQLServer
        ? "preview-sqlserver"
        : isMongoDB
          ? "preview-mongodb"
        : isSQLite
          ? "preview-sqlite"
          : isPostgreSQL
            ? "preview-postgresql"
            : isOracle
              ? "preview-oracle"
              : "preview-mysql";

      const payload = {
        ...getPayload(),
        ...(isMongoDB
          ? { collection: selectedTable }
          : isPostgreSQL || isSQLServer
            ? { table_name: selectedTable }
            : { table: selectedTable })
      };

      const result = await apiRequest(endpoint, payload);

      setPreviewData(
        isMongoDB
          ? {
              table: result.collection,
              columns: result.columns,
              rows: result.preview,
              row_count: result.rows_count
            }
          : isSQLServer
            ? {
                table: result.table_name,
                columns: result.columns,
                rows: result.preview,
                row_count: result.rows_count
              }
            : isPostgreSQL
              ? {
                table: result.table_name,
                columns: result.columns,
                rows: result.preview,
                row_count: result.rows_count
              }
            : result
      );
    } catch (error) {
      setConnectionError(
        error.message || "Unable to preview table."
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  async function importTable() {
    if (!selectedTable) {
      setConnectionError("Please select a table.");
      return;
    }

    const sourceName = isSQLServer
      ? sqlserver.database
      : isMongoDB
        ? mongodb.database
      : isSQLite
        ? sqlite.database_file
        : isPostgreSQL
          ? postgresql.database
          : isOracle
            ? oracle.service_name
            : mysql.database;

    const sourceType = isSQLServer
      ? "Microsoft SQL Server"
      : isMongoDB
        ? "MongoDB"
      : isSQLite
        ? "SQLite"
        : isPostgreSQL
          ? "PostgreSQL"
          : isOracle
            ? "Oracle"
            : "MySQL";

    const confirmed = window.confirm(
      `Import ${selectedTable} from ${sourceType} (${sourceName}) into Cognify Data?`
    );

    if (!confirmed) return;

    setImporting(true);
    setConnectionError("");
    setImportedResult(null);

    try {
      const endpoint = isSQLServer
        ? "import-sqlserver"
        : isMongoDB
          ? "import-mongodb"
        : isSQLite
          ? "import-sqlite"
          : isPostgreSQL
            ? "import-postgresql"
            : isOracle
              ? "import-oracle"
              : "import-mysql";

      const payload = {
        ...getPayload(),
        ...(isMongoDB
          ? { collection: selectedTable }
          : isPostgreSQL || isSQLServer
            ? { table_name: selectedTable }
            : { table: selectedTable })
      };

      const result = await apiRequest(endpoint, payload);

      setImportedResult(
        isMongoDB || isPostgreSQL || isSQLServer
          ? {
              ...result,
              id: result.dataset_id,
              rows: result.rows_count
            }
          : result
      );
      await loadDatasets();
    } catch (error) {
      setConnectionError(
        error.message || "Unable to import table."
      );
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete(dataset) {
    const confirmed = window.confirm(
      `Delete "${dataset.filename}" from Cognify Data?`
    );

    if (!confirmed) return;

    setDeletingId(dataset.id);
    setPageError("");
    setNotice("");

    try {
      await deleteDataset(dataset.id);

      setDatasets((current) =>
        current.filter((item) => item.id !== dataset.id)
      );

      setNotice("Dataset deleted successfully.");
    } catch (error) {
      setPageError(
        error.message || "Unable to delete dataset."
      );
    } finally {
      setDeletingId(null);
    }
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString();
  }

  function analyzeImportedDataset() {
    const id = importedResult?.id;

    if (!id) return;

    closeConnection();
    onAnalytics?.(id);
  }

  return (
    <div className="ds-page">

      {/* HEADER */}
      <header className="ds-header">
        <div>
          <div className="ds-eyebrow">
            <Activity size={14} />
            COGNIFY DATA / INTEGRATIONS
          </div>

          <h1>Data Sources</h1>

          <p>
            Connect your databases, explore your data and
            bring everything into one analytics workspace.
          </p>
        </div>

        <button
          className="ds-button ds-button-primary"
          onClick={onUpload}
        >
          <Plus size={17} />
          Upload Dataset
        </button>
      </header>

      {/* MESSAGES */}
      {pageError && (
        <div className="ds-alert ds-alert-error">
          <AlertCircle size={18} />
          {pageError}
        </div>
      )}

      {notice && (
        <div className="ds-alert ds-alert-info">
          <AlertCircle size={18} />
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* SUMMARY CARDS */}
      <section className="ds-stats-grid">
        <div className="ds-stat-card">
          <div className="ds-stat-icon purple">
            <Database size={21} />
          </div>
          <div>
            <span>Imported Datasets</span>
            <strong>{loading ? "—" : datasets.length}</strong>
            <small>Available in workspace</small>
          </div>
        </div>

        <div className="ds-stat-card">
          <div className="ds-stat-icon blue">
            <Rows3 size={21} />
          </div>
          <div>
            <span>Total Records</span>
            <strong>{loading ? "—" : totalRows.toLocaleString()}</strong>
            <small>Across all datasets</small>
          </div>
        </div>

        <div className="ds-stat-card">
          <div className="ds-stat-icon pink">
            <Columns3 size={21} />
          </div>
          <div>
            <span>Total Columns</span>
            <strong>{loading ? "—" : totalColumns.toLocaleString()}</strong>
            <small>Available data fields</small>
          </div>
        </div>

        <div className="ds-stat-card">
          <div className="ds-stat-icon green">
            <Plug size={21} />
          </div>
          <div>
            <span>Active Connectors</span>
            <strong>6 / 6</strong>
            <small>MySQL, Oracle, SQLite, PostgreSQL, MongoDB and SQL Server enabled</small>
          </div>
        </div>
      </section>

      {/* DATABASE CONNECTORS */}
      <section className="ds-section">
        <div className="ds-section-heading">
          <div>
            <span className="ds-section-label">
              CONNECTORS
            </span>
            <h2>Database Integrations</h2>
            <p>
              Select a database to configure your connection.
            </p>
          </div>

          <div className="ds-live-indicator">
            <span />
            Connection services
          </div>
        </div>

        <div className="ds-connectors-grid">
          {DATABASES.map((database) => {
            const Icon = database.icon;

            return (
              <article
                className={`ds-connector-card ${database.color} ${
                  !database.active ? "ds-disabled-card" : ""
                }`}
                key={database.id}
              >
                <div className="ds-connector-top">
                  <div className={`ds-db-icon ${database.color}`}>
                    <Icon size={24} />
                  </div>

                  <span
                    className={
                      database.active
                        ? "ds-status ds-status-active"
                        : "ds-status ds-status-planned"
                    }
                  >
                    <span />
                    {database.active ? "Available" : "Coming Soon"}
                  </span>
                </div>

                <div className="ds-db-category">
                  {database.category}
                </div>

                <h3>{database.name}</h3>

                <p>{database.description}</p>

                <div className="ds-connector-footer">
                  <span>{database.version}</span>

                  <button
                    className={
                      database.active
                        ? "ds-connect-link"
                        : "ds-connect-link ds-connect-disabled"
                    }
                    onClick={() => openConnection(database)}
                  >
                    {database.active ? "Configure" : "Planned"}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* OTHER SOURCES */}
      <section className="ds-extra-sources">
        <div className="ds-extra-icon">
          <Cloud size={22} />
        </div>

        <div>
          <h3>More data sources coming soon</h3>
          <p>
            Cloud storage, REST APIs and additional integrations
            will be added to the Cognify Data ecosystem.
          </p>
        </div>

        <span>ROADMAP</span>
      </section>

      {/* IMPORTED DATASETS */}
      <section className="ds-section ds-import-section">
        <div className="ds-section-heading ds-history-heading">
          <div>
            <span className="ds-section-label">
              WORKSPACE
            </span>
            <h2>Imported Datasets</h2>
            <p>
              Explore, manage and analyze your imported data.
            </p>
          </div>

          <button
            className="ds-button ds-button-secondary"
            onClick={loadDatasets}
            disabled={loading}
          >
            <RefreshCw
              size={16}
              className={loading ? "ds-spin" : ""}
            />
            Refresh
          </button>
        </div>

        <div className="ds-table-toolbar">
          <div className="ds-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search datasets..."
            />
          </div>

          <span>
            {datasets.length} dataset(s)
          </span>
        </div>

        <div className="ds-table-container">
          {loading ? (
            <div className="ds-empty">
              <RefreshCw className="ds-spin" size={26} />
              <p>Loading datasets...</p>
            </div>
          ) : filteredDatasets.length === 0 ? (
            <div className="ds-empty">
              <div className="ds-empty-icon">
                <FileSpreadsheet size={28} />
              </div>
              <h3>
                {datasets.length
                  ? "No matching datasets"
                  : "No datasets yet"}
              </h3>
              <p>
                Upload a file or connect a database to get started.
              </p>
              <button
                className="ds-button ds-button-primary"
                onClick={onUpload}
              >
                <Upload size={16} />
                Upload Dataset
              </button>
            </div>
          ) : (
            <div className="ds-table-scroll">
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>Dataset</th>
                    <th>Format</th>
                    <th>Rows</th>
                    <th>Columns</th>
                    <th>Imported</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredDatasets.map((dataset) => (
                    <tr key={dataset.id}>
                      <td>
                        <div className="ds-file-name">
                          <div className="ds-file-icon">
                            <FileSpreadsheet size={18} />
                          </div>
                          <span title={dataset.filename}>
                            {dataset.filename}
                          </span>
                        </div>
                      </td>

                      <td>
                        <span className="ds-format">
                          {String(
                            dataset.file_type ||
                            dataset.filename?.split(".").pop() ||
                            "FILE"
                          ).toUpperCase()}
                        </span>
                      </td>

                      <td>
                        {Number(
                          dataset.rows_count ?? dataset.rows ?? 0
                        ).toLocaleString()}
                      </td>

                      <td>
                        {Number(dataset.columns_count || 0)}
                      </td>

                      <td>
                        <span className="ds-date">
                          <Clock size={13} />
                          {formatDate(dataset.uploaded_at)}
                        </span>
                      </td>

                      <td>
                        <span className="ds-imported">
                          <CheckCircle2 size={14} />
                          Imported
                        </span>
                      </td>

                      <td>
                        <div className="ds-row-actions">
                          <button
                            className="ds-action-analyze"
                            onClick={() =>
                              onAnalytics?.(dataset.id)
                            }
                          >
                            <BarChart3 size={15} />
                            Analyze
                          </button>

                          <button
                            className="ds-action-delete"
                            disabled={deletingId === dataset.id}
                            onClick={() => handleDelete(dataset)}
                            title="Delete dataset"
                          >
                            {deletingId === dataset.id ? (
                              <RefreshCw size={16} className="ds-spin" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* DATABASE CONNECTION MODAL */}
      {showConnection && (
        <div
          className="ds-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeConnection();
            }
          }}
        >
          <section
            className="ds-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ds-modal-title"
          >
            <header className="ds-modal-header">
              <div className="ds-modal-brand">
                <div className={`ds-db-icon ${currentDatabase.color}`}>
                  <CurrentDatabaseIcon size={24} />
                </div>

                <div>
                  <span>DATABASE CONNECTION</span>
                  <h2 id="ds-modal-title">
                    Connect {currentDatabase.name}
                  </h2>
                  <p>
                    Configure your database connection.
                  </p>
                </div>
              </div>

              <button
                className="ds-modal-close"
                onClick={closeConnection}
                disabled={testing || previewLoading || importing}
              >
                <X size={20} />
              </button>
            </header>

            <div className="ds-modal-content">

              {/* CONNECTION FORM */}
              <form
                className="ds-connection-form"
                onSubmit={testConnection}
              >
                <div className="ds-form-title">
                  <Settings2 size={18} />
                  <div>
                    <strong>Connection Configuration</strong>
                    <span>
                      Enter your database connection details.
                    </span>
                  </div>
                </div>

                <div className="ds-form-grid">
                  {isSQLServer ? (
                    <>
                      <label>
                        Host Address
                        <input
                          name="host"
                          value={sqlserver.host}
                          onChange={handleSQLServerChange}
                          placeholder="localhost or server hostname"
                          required
                        />
                      </label>

                      <label>
                        Port
                        <input
                          name="port"
                          type="number"
                          min="1"
                          max="65535"
                          value={sqlserver.port}
                          onChange={handleSQLServerChange}
                          required
                        />
                      </label>

                      <label className="ds-full-field">
                        Database Name
                        <input
                          name="database"
                          value={sqlserver.database}
                          onChange={handleSQLServerChange}
                          placeholder="Your SQL Server database"
                          required
                        />
                      </label>

                      <label>
                        Schema
                        <input
                          name="schema"
                          value={sqlserver.schema}
                          onChange={handleSQLServerChange}
                          placeholder="dbo"
                        />
                      </label>

                      <label>
                        ODBC Driver
                        <select
                          name="driver"
                          value={sqlserver.driver}
                          onChange={handleSQLServerChange}
                        >
                          <option value="ODBC Driver 18 for SQL Server">ODBC Driver 18 for SQL Server</option>
                          <option value="ODBC Driver 17 for SQL Server">ODBC Driver 17 for SQL Server</option>
                          <option value="SQL Server">SQL Server</option>
                        </select>
                      </label>

                      <label className="ds-full-field">
                        Username
                        <input
                          name="username"
                          value={sqlserver.username}
                          onChange={handleSQLServerChange}
                          placeholder="SQL Server username"
                          autoComplete="username"
                          required
                        />
                      </label>

                      <label className="ds-full-field">
                        Password
                        <div className="ds-password-field">
                          <input
                            name="password"
                            type={showPassword ? "text" : "password"}
                            value={sqlserver.password}
                            onChange={handleSQLServerChange}
                            placeholder="Enter SQL Server password"
                            autoComplete="new-password"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((value) => !value)}
                            aria-label="Toggle password visibility"
                          >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </label>
                    </>
                  ) : isMongoDB ? (
                    <>
                      <label className="ds-full-field">
                        MongoDB Atlas Connection String

                        <div className="ds-password-field">
                          <input
                            name="connection_string"
                            type={showPassword ? "text" : "password"}
                            value={mongodb.connection_string}
                            onChange={handleMongoDBChange}
                            placeholder="mongodb+srv://username:password@cluster.mongodb.net/"
                            autoComplete="off"
                            required
                          />

                          <button
                            type="button"
                            onClick={() =>
                              setShowPassword((value) => !value)
                            }
                            aria-label="Toggle connection string visibility"
                          >
                            {showPassword
                              ? <EyeOff size={18} />
                              : <Eye size={18} />}
                          </button>
                        </div>

                        <small>
                          Paste your MongoDB Atlas connection string.
                        </small>
                      </label>

                      <label className="ds-full-field">
                        Database Name

                        <input
                          name="database"
                          value={mongodb.database}
                          onChange={handleMongoDBChange}
                          placeholder="cognify_data"
                          required
                        />
                      </label>
                    </>
                  ) : isSQLite ? (
                    <label className="ds-full-field">
                      SQLite Database Filename

                      <input
                        name="database_file"
                        value={sqlite.database_file}
                        onChange={handleSQLiteChange}
                        placeholder="students.db"
                        required
                      />

                      <small>
                        Place your .db, .sqlite or .sqlite3 file inside
                        backend/datasets/sqlite_databases/
                      </small>
                    </label>
                  ) : isPostgreSQL ? (
                    <>
                      <label>
                        Host Address

                        <input
                          name="host"
                          value={postgresql.host}
                          onChange={handlePostgreSQLChange}
                          placeholder="127.0.0.1 or cloud database hostname"
                          required
                        />
                      </label>

                      <label>
                        Port

                        <input
                          name="port"
                          type="number"
                          min="1"
                          max="65535"
                          value={postgresql.port}
                          onChange={handlePostgreSQLChange}
                          required
                        />
                      </label>

                      <label className="ds-full-field">
                        Database Name

                        <input
                          name="database"
                          value={postgresql.database}
                          onChange={handlePostgreSQLChange}
                          placeholder="Database name"
                          required
                        />
                      </label>

                      <label className="ds-full-field">
                        Schema

                        <input
                          name="schema"
                          value={postgresql.schema}
                          onChange={handlePostgreSQLChange}
                          placeholder="public"
                        />
                      </label>

                      <label className="ds-full-field">
                        Username

                        <input
                          name="username"
                          value={postgresql.username}
                          onChange={handlePostgreSQLChange}
                          placeholder="PostgreSQL username"
                          autoComplete="username"
                          required
                        />
                      </label>

                      <label className="ds-full-field">
                        Password

                        <div className="ds-password-field">
                          <input
                            name="password"
                            type={showPassword ? "text" : "password"}
                            value={postgresql.password}
                            onChange={handlePostgreSQLChange}
                            placeholder="Enter PostgreSQL password"
                            autoComplete="new-password"
                            required
                          />

                          <button
                            type="button"
                            onClick={() =>
                              setShowPassword((value) => !value)
                            }
                            aria-label="Toggle password visibility"
                          >
                            {showPassword
                              ? <EyeOff size={18} />
                              : <Eye size={18} />}
                          </button>
                        </div>
                      </label>
                    </>
                  ) : (
                    <>
                      <label>
                        Host Address

                        <input
                          name="host"
                          value={isOracle ? oracle.host : mysql.host}
                          onChange={
                            isOracle ? handleOracleChange : handleMysqlChange
                          }
                          placeholder="127.0.0.1"
                          required
                        />
                      </label>

                      <label>
                        Port

                        <input
                          name="port"
                          type="number"
                          min="1"
                          max="65535"
                          value={isOracle ? oracle.port : mysql.port}
                          onChange={
                            isOracle ? handleOracleChange : handleMysqlChange
                          }
                          required
                        />
                      </label>

                      {isOracle ? (
                        <label className="ds-full-field">
                          Service Name

                          <input
                            name="service_name"
                            value={oracle.service_name}
                            onChange={handleOracleChange}
                            placeholder="XE"
                            required
                          />
                        </label>
                      ) : (
                        <label className="ds-full-field">
                          Database Name

                          <input
                            name="database"
                            value={mysql.database}
                            onChange={handleMysqlChange}
                            placeholder="Database name"
                            required
                          />
                        </label>
                      )}

                      <label className="ds-full-field">
                        Username

                        <input
                          name="username"
                          value={isOracle ? oracle.username : mysql.username}
                          onChange={
                            isOracle ? handleOracleChange : handleMysqlChange
                          }
                          placeholder="Database username"
                          autoComplete="username"
                          required
                        />
                      </label>

                      <label className="ds-full-field">
                        Password

                        <div className="ds-password-field">
                          <input
                            name="password"
                            type={showPassword ? "text" : "password"}
                            value={isOracle ? oracle.password : mysql.password}
                            onChange={
                              isOracle ? handleOracleChange : handleMysqlChange
                            }
                            placeholder="Enter database password"
                            autoComplete="new-password"
                            required
                          />

                          <button
                            type="button"
                            onClick={() =>
                              setShowPassword((value) => !value)
                            }
                            aria-label="Toggle password visibility"
                          >
                            {showPassword
                              ? <EyeOff size={18} />
                              : <Eye size={18} />}
                          </button>
                        </div>
                      </label>
                    </>
                  )}
                </div>

                <div className="ds-security-note">
                  <LockKeyhole size={17} />
                  <span>
                    {isSQLite
                      ? "SQLite databases are opened in read-only mode. Only files inside the configured backend SQLite folder can be accessed."
                      : isSQLServer
                        ? "Connect to Microsoft SQL Server using host, port, database, schema and SQL authentication credentials."
                        : isMongoDB
                        ? "Connect to MongoDB Atlas using your connection string and database name. Collections will be available after a successful connection."
                        : isPostgreSQL
                          ? "Connect to a PostgreSQL database using its host, port, database, schema and credentials."
                          : "Credentials are sent to your backend for the current request. They are not stored by this form. Use a dedicated read-only database account."}
                  </span>
                </div>

                {connectionError && (
                  <div className="ds-alert ds-alert-error">
                    <AlertCircle size={18} />
                    {connectionError}
                  </div>
                )}

                <button
                  type="submit"
                  className="ds-button ds-button-primary ds-test-button"
                  disabled={testing || previewLoading || importing}
                >
                  {testing ? (
                    <>
                      <RefreshCw size={17} className="ds-spin" />
                      Testing Connection...
                    </>
                  ) : (
                    <>
                      <Plug size={17} />
                      Test Database Connection
                    </>
                  )}
                </button>
              </form>

              {/* CONNECTION SUCCESS */}
              {connectionResult && (
                <div className="ds-connected-workspace">

                  <div className="ds-connected-banner">
                    <div className="ds-connected-check">
                      <CheckCircle2 size={22} />
                    </div>

                    <div>
                      <strong>Connection Established</strong>
                      <p>
                        {currentDatabase.name} database is responding.
                        {" "}
                        {connectionResult.tables?.length ?? 0}{" "}
                        {isMongoDB ? "collections" : "tables"} found.
                      </p>
                    </div>

                    <span>CONNECTED</span>
                  </div>

                  {/* TABLE SELECTOR */}
                  <div className="ds-table-explorer">
                    <div className="ds-explorer-heading">
                      <div>
                        <span>SCHEMA EXPLORER</span>
                        <h3>
                          <Table2 size={18} />
                          {isMongoDB ? "Available Collections" : "Available Tables"}
                        </h3>
                      </div>

                      <span className="ds-count">
                        {connectionResult.tables?.length ?? 0}{" "}
                        {isMongoDB ? "collections" : "tables"}
                      </span>
                    </div>

                    {connectionResult.tables?.length > 0 ? (
                      <>
                        <label className="ds-table-picker">
                          Select a table

                          <select
                            value={selectedTable}
                            onChange={(event) => {
                              setSelectedTable(event.target.value);
                              setPreviewData(null);
                              setImportedResult(null);
                              setConnectionError("");
                            }}
                          >
                            {connectionResult.tables.map((table) => (
                              <option key={table} value={table}>
                                {table}
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="ds-explorer-actions">
                          <button
                            className="ds-button ds-button-secondary"
                            onClick={previewTable}
                            disabled={previewLoading || importing}
                          >
                            {previewLoading
                              ? <RefreshCw size={16} className="ds-spin" />
                              : <Eye size={16} />}
                            Preview Data
                          </button>

                          <button
                            className="ds-button ds-button-primary"
                            onClick={importTable}
                            disabled={importing || previewLoading}
                          >
                            {importing
                              ? <RefreshCw size={16} className="ds-spin" />
                              : <Download size={16} />}
                            {importing
                              ? "Importing..."
                              : isMongoDB
                                ? "Import Collection"
                                : "Import Table"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="ds-no-tables">
                        No tables were found for this account.
                      </div>
                    )}
                  </div>

                  {/* PREVIEW */}
                  {previewData && (
                    <div className="ds-preview">
                      <div className="ds-preview-heading">
                        <div>
                          <span>DATA PREVIEW</span>
                          <h3>
                            <Table2 size={18} />
                            {previewData.table}
                          </h3>
                        </div>

                        <span>
                          {previewData.row_count} rows
                        </span>
                      </div>

                      {previewData.rows?.length > 0 ? (
                        <div className="ds-preview-scroll">
                          <table className="ds-preview-table">
                            <thead>
                              <tr>
                                {previewData.columns?.map((column) => (
                                  <th key={column}>{column}</th>
                                ))}
                              </tr>
                            </thead>

                            <tbody>
                              {previewData.rows.map((row, index) => (
                                <tr key={index}>
                                  {previewData.columns?.map((column) => (
                                    <td key={column}>
                                      {row[column] === null ||
                                      row[column] === undefined
                                        ? "NULL"
                                        : String(row[column])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="ds-no-tables">
                          This table contains no preview records.
                        </div>
                      )}
                    </div>
                  )}

                  {/* IMPORT SUCCESS */}
                  {importedResult && (
                    <div className="ds-import-success">
                      <div className="ds-connected-check">
                        <CheckCircle2 size={22} />
                      </div>

                      <div>
                        <strong>Dataset imported successfully</strong>
                        <p>{importedResult.filename}</p>
                        <span>
                          {Number(importedResult.rows).toLocaleString()} rows
                          {" · "}
                          {importedResult.columns_count} columns
                        </span>
                      </div>

                      <button
                        className="ds-button ds-button-primary"
                        onClick={analyzeImportedDataset}
                      >
                        <BarChart3 size={16} />
                        Analyze Dataset
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="ds-modal-footer">
                <button
                  className="ds-button ds-button-secondary"
                  onClick={closeConnection}
                  disabled={testing || previewLoading || importing}
                >
                  Close
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
