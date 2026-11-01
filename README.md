 
# 🚀 Cognify Data
### AI-Powered Data Intelligence, Analytics & Automated Reporting Platform

<p align="center">
  <strong>Transform raw data into meaningful insights with AI.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.13-blue?logo=python" />
  <img src="https://img.shields.io/badge/Django-Backend-092E20?logo=django" />
  <img src="https://img.shields.io/badge/React-Frontend-61DAFB?logo=react" />
  <img src="https://img.shields.io/badge/AI-Groq-orange" />
  <img src="https://img.shields.io/badge/Database-Multi--DB-blue" />
  <img src="https://img.shields.io/badge/Status-Active-success" />
</p>

---

## 📌 Overview

**Cognify Data** is an AI-powered data intelligence platform designed to simplify the complete data analysis lifecycle — from data collection and ingestion to cleaning, exploration, visualization, intelligent analysis, and automated report generation.

The platform enables users to upload structured datasets, connect external databases, scrape web data, perform AI-assisted analytics, interact with datasets using natural language, and generate professional analytical reports in multiple formats.

Instead of switching between multiple tools, Cognify Data brings essential data engineering, analytics, and AI capabilities together in one integrated platform.

### 🎯 Core Objectives

- Simplify data collection from multiple sources.
- Automate data preprocessing and cleaning.
- Enable intelligent data exploration and analytics.
- Make data analysis accessible through natural language.
- Generate interactive dashboards and professional reports.
- Provide secure, role-based access to data and platform features.

---

## ✨ Key Features

### 1. 📂 Multi-Source Data Integration

Import and manage data from multiple sources.

- CSV file upload.
- Excel files (`.xlsx`, `.xls`).
- JSON dataset ingestion.
- MySQL database connectivity.
- Oracle database connectivity.
- PostgreSQL database connectivity.
- SQLite database connectivity.
- MongoDB connectivity.
- SQL Server connectivity.
- Database table preview and import.
- Centralized dataset history.

### 2. 🌐 AI-Assisted Web Data Extraction

Collect structured information from websites.

- Single-page web scraping.
- Same-domain multi-page crawling.
- Extract website content and structured information.
- Preview scraped data before saving.
- Save extracted datasets to Dataset History.
- Export scraped results into CSV, JSON, and Excel formats.

### 3. 🧹 Intelligent Data Cleaning

Prepare datasets for reliable analysis.

- Identify missing values.
- Detect duplicate records.
- Handle missing data.
- Remove duplicate rows.
- Apply data-cleaning operations.
- Preview cleaned datasets before saving.
- Preserve original datasets.
- Export processed datasets.

### 4. 📊 Advanced Data Analytics

Explore datasets through analytical insights and visualizations.

- Dataset overview and statistical summaries.
- Row and column analysis.
- Missing-value analysis.
- Duplicate-record analysis.
- Numerical and categorical analysis.
- Data distribution insights.
- Interactive analytical visualizations.
- Dataset-specific analytics.

### 5. 🤖 Natural Language Data Analyst

Interact with datasets using everyday language.

Ask questions about your data without manually writing complex queries.

Example questions:

- What is the total revenue?
- Show the top 10 customers.
- Which product has the highest sales?
- Calculate the average value of each category.
- Find missing values in the dataset.
- Summarize the important patterns in this data.

**Technology:** Python, Pandas, Groq AI.

The system uses controlled Pandas operations and dataset-aware processing to support analytical questions.

### 6. 📑 AI-Powered Report Generator

Convert dataset analysis into professional reports.

**Supported output formats:**

| Format | Capabilities |
|---|---|
| Interactive HTML | Power BI-style interactive dashboard |
| PowerPoint | Editable analytical presentation with 15+ slides |
| PDF | Structured analytical report |
| Excel | Downloadable analytical workbook |

**Report generation workflow:**

1. Select a dataset.
2. Run AI-powered analysis.
3. Generate analytical insights.
4. Preview the generated report.
5. Export and download the required format.

### 7. 🔐 Authentication & Role-Based Access Control

Secure platform access through user authentication and role management.

| Role | Access |
|---|---|
| Admin | Platform overview, user management, dataset monitoring and analytics |
| User | Dataset management, data analytics, AI analyst and report generation |
| Viewer | Read-only access to permitted resources |

Additional security features include:

- User authentication.
- Session-based access.
- Role-based permissions.
- User-specific dataset ownership.
- Protected API endpoints.
- Server-side authorization checks.

---

## 🏗️ System Architecture

Cognify Data follows a modular full-stack architecture.

```text
                 ┌──────────────────────────┐
                 │       React Frontend     │
                 │                          │
                 │ Dashboard                 │
                 │ Data Sources              │
                 │ Data Analytics            │
                 │ AI Data Analyst           │
                 │ Data Cleaning             │
                 │ AI Report Generator       │
                 └────────────┬─────────────┘
                              │
                         REST API
                              │
                 ┌────────────▼─────────────┐
                 │      Django Backend      │
                 │                          │
                 │ Authentication           │
                 │ Dataset Management       │
                 │ Database Connectors      │
                 │ Web Scraping              │
                 │ Data Cleaning             │
                 │ Analytics Engine          │
                 │ AI Integration            │
                 │ Report Generation         │
                 └────────────┬─────────────┘
                              │
              ┌───────────────┼────────────────┐
              │               │                │
       ┌──────▼──────┐ ┌──────▼──────┐ ┌───────▼────────┐
       │ Databases   │ │ Groq AI     │ │ File Storage   │
       │             │ │             │ │                │
       │ MySQL       │ │ LLM         │ │ CSV / Excel    │
       │ Oracle      │ │ Integration │ │ JSON / PDF     │
       │ PostgreSQL  │ │             │ │ PPTX / HTML    │
       │ MongoDB     │ │             │ │                │
       │ SQLite      │ │             │ │                │
       └─────────────┘ └─────────────┘ └────────────────┘
```

---

## 🛠️ Technology Stack

| Category | Technologies |
|---|---|
| Frontend | React.js, JavaScript, HTML5, CSS3 |
| Frontend Build Tool | Vite |
| Backend | Python, Django |
| API | Django REST Framework / REST APIs |
| Data Processing | Pandas, NumPy |
| AI Integration | Groq API |
| AI Model | `openai/gpt-oss-120b` |
| Database Connectivity | MySQL, Oracle, PostgreSQL, SQLite, MongoDB, SQL Server |
| Data Visualization | Interactive charts and dashboards |
| Web Extraction | Python web scraping libraries |
| Report Generation | python-pptx, ReportLab, openpyxl |
| Authentication | Django Session Authentication |
| Version Control | Git, GitHub |

---

## 📁 Project Structure

```text
Cognify-Data/
│
├── backend/
│   ├── backend/
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   │
│   ├── datasets/
│   │   ├── models.py
│   │   ├── views.py
│   │   ├── urls.py
│   │   ├── data_cleaning.py
│   │   ├── ai_reports.py
│   │   └── ...
│   │
│   ├── manage.py
│   └── requirements.txt
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── DatasetAnalytics.jsx
│   │   │   ├── DataCleaning.jsx
│   │   │   ├── AIDataAnalyst.jsx
│   │   │   ├── AIReportGenerator.jsx
│   │   │   └── ...
│   │   │
│   │   ├── services/
│   │   │   └── api.js
│   │   │
│   │   ├── App.jsx
│   │   └── main.jsx
│   │
│   ├── package.json
│   └── vite.config.js
│
├── storage/
│   ├── uploads/
│   ├── processed/
│   ├── reports/
│   └── videos/
│
├── .env.example
├── .gitignore
└── README.md
```

*Note: This is a representative structure. Actual filenames and additional modules may vary with your repository.*

---

## ⚙️ Installation & Setup

### Prerequisites

Install the following before running the project:

- Python 3.13+
- Node.js and npm
- Git
- A supported database, if using database connectivity
- Groq API key for AI-powered functionality

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/Cognify-Data.git

cd Cognify-Data
```

### 2. Backend Setup

Navigate to the backend directory:

```bash
cd backend
```

Create a virtual environment:

```bash
python -m venv venv
```

Activate the environment.

**Windows:**

```bash
venv\Scripts\activate
```

**Linux / macOS:**

```bash
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create a `.env` file in the backend directory.

```env
SECRET_KEY=your_django_secret_key
DEBUG=True

ALLOWED_HOSTS=localhost,127.0.0.1

GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-120b
```

Add any additional database and storage variables required by your configuration.

**Important:** Never commit your actual `.env` file or API keys to GitHub.

### 4. Database Migration

```bash
python manage.py makemigrations

python manage.py migrate
```

Create an administrator account:

```bash
python manage.py createsuperuser
```

### 5. Start the Django Server

```bash
python manage.py runserver
```

Backend:

```text
http://127.0.0.1:8000/
```

### 6. Frontend Setup

Open another terminal:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Frontend:

```text
http://localhost:5173/
```

---

## 🔌 API Overview

The backend exposes REST API endpoints for dataset management and analytics.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/datasets/upload/` | POST | Upload a dataset |
| `/api/datasets/history/` | GET | Retrieve dataset history |
| `/api/datasets/stats/` | GET | Dashboard statistics |
| `/api/datasets/analytics/` | GET | Dataset analytics |
| `/api/datasets/<id>/delete/` | DELETE | Delete a dataset |
| `/api/datasets/scrape/` | POST | Scrape a webpage |
| `/api/datasets/crawl/` | POST | Crawl multiple pages |
| `/api/datasets/scrape/save/` | POST | Save scraped data |
| `/api/datasets/reports/analyze/` | POST | Analyze a dataset for reporting |
| `/api/datasets/reports/export/<format>/` | POST | Export an analytical report |

*Additional endpoints support authentication, database connections, imports, data cleaning, and AI-powered analysis.*

---

## 🧠 AI Processing Workflow

```text
       User Selects Dataset
                │
                ▼
        Dataset Validation
                │
                ▼
       Data Preprocessing
                │
                ▼
       Statistical Analysis
                │
                ▼
       AI Insight Generation
                │
                ▼
        Report Preparation
                │
                ▼
       Interactive Dashboard
                │
                ▼
       Export Report Formats
```

Cognify Data combines Python-based data processing with AI-assisted interpretation to make analytical results easier to understand and communicate.

---

## 🔒 Security Considerations

The platform incorporates security measures such as:

- Authentication-protected API endpoints.
- User-specific dataset access.
- Role-based authorization.
- CSRF protection for session-based requests.
- CORS configuration.
- Server-side validation.
- Environment-based secret management.
- Backend-only AI API credentials.

For production deployment:

- Set `DEBUG=False`.
- Use a strong Django `SECRET_KEY`.
- Configure trusted HTTPS origins.
- Configure production CORS and CSRF settings.
- Use a production database such as PostgreSQL.
- Store uploaded files and generated reports in persistent storage.
- Never expose database passwords or AI API keys in frontend code.

---

## ☁️ Deployment

Cognify Data can be deployed using separate frontend and backend hosting services.

| Component | Suggested Platform |
|---|---|
| React Frontend | Vercel |
| Django Backend | Render |
| Production Database | PostgreSQL / Supabase |
| File Storage | Cloudinary or compatible object storage |
| AI Services | Groq API |

### Deployment Checklist

- [ ] Configure production environment variables.
- [ ] Migrate the database to PostgreSQL.
- [ ] Configure production CORS and CSRF settings.
- [ ] Configure persistent file storage.
- [ ] Deploy the Django backend.
- [ ] Deploy the React frontend.
- [ ] Configure the frontend API base URL.
- [ ] Test authentication and role permissions.
- [ ] Test dataset upload and retrieval.
- [ ] Test AI analytics and report exports.
- [ ] Verify HTTPS and production security settings.

*Hosting availability, pricing, storage, and free-tier limitations depend on the provider's current plans.*

---

## 🚀 Future Enhancements

Potential future improvements include:

- Advanced predictive analytics.
- Automated anomaly detection.
- Scheduled data pipelines.
- More visualization options.
- Enhanced data governance.
- Advanced audit logging.
- More database integrations.
- Scalable background processing.

---

## 👨‍💻 Author

**Developed as an MCA-level full-stack AI and data intelligence project.**

- GitHub: [Your GitHub Profile](https://github.com/YOUR_USERNAME)
- Project: Cognify Data

---

## ⭐ Support

If you find Cognify Data interesting or useful, consider giving the repository a ⭐ on GitHub.

Your support helps encourage further development!

---

<p align="center">
  <strong>Cognify Data — From Raw Data to Intelligent Decisions.</strong>
</p>
