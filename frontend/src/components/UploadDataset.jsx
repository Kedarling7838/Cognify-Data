
import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from "lucide-react";
import { uploadDataset } from "../services/api";

export default function UploadDataset() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function handleUpload() {
    if (!file) {
      setError("Please select a CSV, Excel, or JSON file.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await uploadDataset(file);
      setResult(data);
    } catch (err) {
      setError(err.message || "Unable to upload the dataset.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="upload-workspace">
      <div className="upload-heading">
        <h2>Upload your dataset</h2>
        <p>Upload data to discover patterns and data-quality issues.</p>
      </div>

      <div
        className="upload-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const dropped = event.dataTransfer.files[0];
          if (dropped) {
            setFile(dropped);
            setError("");
            setResult(null);
          }
        }}
      >
        <div className="upload-icon">
          <Upload size={28} />
        </div>

        <h3>Choose a file to analyze</h3>
        <p>Supported formats: CSV, XLSX, XLS, JSON · Maximum 10 MB</p>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.json"
          hidden
          onChange={(event) => {
            setFile(event.target.files?.[0] || null);
            setError("");
            setResult(null);
          }}
        />

        <button
          className="primary-button"
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          <Upload size={16} /> Browse files
        </button>

        {file && (
          <div className="selected-file">
            <FileSpreadsheet size={18} />
            <span>{file.name}</span>
            <span>{(file.size / 1024).toFixed(1)} KB</span>
          </div>
        )}

        {file && (
          <button
            className="primary-button analyze-button"
            onClick={handleUpload}
            disabled={loading}
            type="button"
          >
            {loading ? "Analyzing..." : "Upload and analyze"}
          </button>
        )}
      </div>

      {error && (
        <div className="upload-message error-message">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {result && (
        <div className="dataset-results">
          <div className="success-heading">
            <CheckCircle size={20} />
            <div>
              <h3>Dataset analyzed successfully</h3>
              <p>{result.filename}</p>
            </div>
          </div>

          <div className="dataset-stats">
            <div className="dataset-stat">
              <span>Rows</span><strong>{result.rows}</strong>
            </div>
            <div className="dataset-stat">
              <span>Columns</span><strong>{result.columns_count}</strong>
            </div>
            <div className="dataset-stat">
              <span>Missing values</span><strong>{result.missing_values}</strong>
            </div>
            <div className="dataset-stat">
              <span>Duplicate rows</span><strong>{result.duplicate_rows}</strong>
            </div>
          </div>

          <h3 className="preview-title">Data preview</h3>
          <div className="preview-table-wrapper">
            <table className="preview-table">
              <thead>
                <tr>
                  {result.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.preview.map((row, index) => (
                  <tr key={index}>
                    {result.columns.map((column) => (
                      <td key={column}>
                        {row[column] == null ? "—" : String(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
