from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),

    # Dataset APIs
    path("api/datasets/", include("datasets.urls")),

    # Authentication APIs
    path("api/auth/", include("accounts.urls")),
]