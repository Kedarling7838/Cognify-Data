
import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  Database,
  AlertCircle,
  Trash2,
} from "lucide-react";

import {
  getDatasetHistory,
  deleteDataset,
} from "../services/api";

export default function DatasetHistory() {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getDatasetHistory();
      setDatasets(data);
    } catch (err) {
      setError(err.message || "Unable to load history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function handleDelete(dataset) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${dataset.filename}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingId(dataset.id);
    setError("");

    try {
      await deleteDataset(dataset.id);
      setDatasets((current) =>
        current.filter((item) => item.id !== dataset.id)
      );
    } catch (err) {
      setError(err.message || "Unable to delete dataset.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="upload-workspace">
      <div className="upload-heading history-heading">
        <div>
          <h2>Dataset History</h2>
          <p>Review and manage datasets uploaded to Cognify Data.</p>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={loadHistory}
          disabled={loading || deletingId !== null}
        >
          <RefreshCw size={16} />
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="upload-message error-message" role="alert">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {loading && <p>Loading dataset history...</p>}

      {!loading && !error && datasets.length === 0 && (
        <div className="upload-dropzone history-empty">
          <Database size={36} />
          <h3>No datasets uploaded yet</h3>
          <p>Upload a CSV, Excel, or JSON file to see it here.</p>
        </div>
      )}

      {!loading && datasets.length > 0 && (
        <>
          <div className="preview-table-wrapper">
            <table className="preview-table">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Format</th>
                  <th>Rows</th>
                  <th>Columns</th>
                  <th>Missing</th>
                  <th>Duplicates</th>
                  <th>Uploaded At</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {datasets.map((dataset) => (
                  <tr key={dataset.id}>
                    <td>{dataset.filename}</td>
                    <td>{dataset.file_type.toUpperCase()}</td>
                    <td>{dataset.rows}</td>
                    <td>{dataset.columns_count}</td>
                    <td>{dataset.missing_values}</td>
                    <td>{dataset.duplicate_rows}</td>
                    <td>
                      {new Date(dataset.uploaded_at).toLocaleString()}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="delete-dataset-button"
                        onClick={() => handleDelete(dataset)}
                        disabled={deletingId !== null}
                        aria-label={`Delete ${dataset.filename}`}
                        title="Delete dataset"
                      >
                        <Trash2 size={16} />
                        {deletingId === dataset.id
                          ? "Deleting..."
                          : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="history-count">
            {datasets.length} saved dataset
            {datasets.length === 1 ? "" : "s"}
          </p>
        </>
      )}
    </section>
  );
}
