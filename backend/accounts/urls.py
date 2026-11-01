
from django.urls import path
from . import views

urlpatterns = [
    # CSRF token
    path("csrf/", views.csrf_token, name="csrf_token"),

    # Authentication
    path("register/", views.register, name="register"),
    path("login/", views.user_login, name="login"),
    path("logout/", views.user_logout, name="logout"),
    path("me/", views.current_user, name="current_user"),

    # Admin user management
    path(
        "admin/users/",
        views.admin_user_list,
        name="admin_user_list",
    ),
    path(
        "admin/users/<int:user_id>/role/",
        views.admin_update_user_role,
        name="admin_update_user_role",
    ),
    path(
        "admin/users/<int:user_id>/status/",
        views.admin_update_user_status,
        name="admin_update_user_status",
    ),
]
