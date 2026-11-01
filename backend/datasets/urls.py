from django.urls import path
from . import views
from . import ai_analyst
from . import data_cleaning
from . import ai_reports
urlpatterns = [
    # Dataset operations
    path("upload/", views.upload_dataset, name="upload_dataset"),
    path("history/", views.dataset_history, name="dataset_history"),
    path("stats/", views.dashboard_stats, name="dashboard_stats"),
    path("analytics/", views.dataset_analytics, name="dataset_analytics"),
    path(
        "<int:dataset_id>/delete/",
        views.delete_dataset,
        name="delete_dataset",
    ),

    # MySQL operations
    path("connect-mysql/", views.connect_mysql, name="connect_mysql"),
    path(
        "preview-mysql/",
        views.preview_mysql_table,
        name="preview_mysql_table",
    ),
    path(
        "import-mysql/",
        views.import_mysql_table,
        name="import_mysql_table",
    ),

    # Oracle operations
    path("connect-oracle/", views.connect_oracle, name="connect_oracle"),
    path(
        "preview-oracle/",
        views.preview_oracle_table,
        name="preview_oracle_table",
    ),
    path(
        "import-oracle/",
        views.import_oracle_table,
        name="import_oracle_table",
    ),

    # SQLite operations
    path("connect-sqlite/", views.connect_sqlite, name="connect_sqlite"),
    path(
        "preview-sqlite/",
        views.preview_sqlite_table,
        name="preview_sqlite_table",
    ),
    path(
        "import-sqlite/",
        views.import_sqlite_table,
        name="import_sqlite_table",
    ),
    path(
        "connect-postgresql/",
        views.connect_postgresql,
        name="connect_postgresql",
    ),
    path(
        "preview-postgresql/",
        views.preview_postgresql_table,
        name="preview_postgresql_table",
    ),
    path(
        "import-postgresql/",
        views.import_postgresql_table,
        name="import_postgresql_table",
    ),
    path(
    "connect-mongodb/",
    views.connect_mongodb,
    name="connect_mongodb"
),
    path(
    "preview-mongodb/",
    views.preview_mongodb_collection,
    name="preview_mongodb_collection"
    ),
    path(
    "import-mongodb/",
    views.import_mongodb_collection,
    name="import_mongodb_collection"
    ),
        # Microsoft SQL Server operations
    path(
        "connect-sqlserver/",
        views.connect_sqlserver,
        name="connect_sqlserver",
    ),
    path(
        "preview-sqlserver/",
        views.preview_sqlserver_table,
        name="preview_sqlserver_table",
    ),
    path(
        "import-sqlserver/",
        views.import_sqlserver_table,
        name="import_sqlserver_table",
    ),
    # Web Scraping
    path("scrape/", views.scrape_webpage, name="scrape_webpage"),
    path("scrape/save/", views.save_scraped_dataset, name="save_scraped_dataset"),
    path("crawl/", views.crawl_website, name="crawl_website"),
    
    path(
    "ai-analyze/",
    ai_analyst.ai_analyze_dataset,
    name="ai_analyze_dataset",
),
      # AI Data Cleaning & Transformation
    path(
        "cleaning/profile/",
        data_cleaning.cleaning_profile,
        name="cleaning_profile",
    ),
    path(
        "cleaning/preview/",
        data_cleaning.cleaning_preview,
        name="cleaning_preview",
    ),
    path(
        "cleaning/save/",
        data_cleaning.cleaning_save,
        name="cleaning_save",
    ),
    path(
        "cleaning/export/",
        data_cleaning.cleaning_export,
        name="cleaning_export",
    ),
        # AI Report Generator
    path(
        "reports/analyze/",
        ai_reports.analyze_dataset_report,
        name="analyze_dataset_report",
    ),
    path(
    "reports/export/<str:export_format>/",
    ai_reports.export_dataset_report,
    name="export_dataset_report",
),
    path(
    "admin/stats/",
    views.admin_dashboard_stats,
    name="admin_dashboard_stats",
),
]