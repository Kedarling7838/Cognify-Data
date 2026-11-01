
import json

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from .models import UserProfile
from django.db.models import Q
from .permissions import role_required

User = get_user_model()


def get_request_data(request):
    """Read and validate JSON request data."""
    try:
        data = json.loads(request.body or "{}")
        return data if isinstance(data, dict) else None
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None


def get_or_create_user_profile(user):
    """Ensure every user has a profile."""
    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={"role": "user"},
    )
    return profile


def user_response_data(user):
    """Return safe user information and their assigned role."""

    profile = get_or_create_user_profile(user)

    # Django staff and superusers always receive admin access.
    if user.is_staff or user.is_superuser:
        role = "admin"
    else:
        role = profile.role

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": user.get_full_name() or user.username,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "role": role,
    }


@require_GET
@ensure_csrf_cookie
def csrf_token(request):
    """Provide a CSRF cookie and token."""
    return JsonResponse({
        "success": True,
        "csrfToken": get_token(request),
    })


@require_POST
@csrf_protect
def register(request):
    """Register a new Cognify Data user."""

    data = get_request_data(request)

    if data is None:
        return JsonResponse({
            "success": False,
            "message": "Invalid JSON request.",
        }, status=400)

    username = str(data.get("username", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    first_name = str(data.get("first_name", "")).strip()
    last_name = str(data.get("last_name", "")).strip()
    password = data.get("password", "")
    confirm_password = data.get("confirm_password", "")

    if not all([username, email, password, confirm_password]):
        return JsonResponse({
            "success": False,
            "message": "Username, email and password fields are required.",
        }, status=400)

    if not isinstance(password, str) or not isinstance(confirm_password, str):
        return JsonResponse({
            "success": False,
            "message": "Password must be a valid string.",
        }, status=400)

    if password != confirm_password:
        return JsonResponse({
            "success": False,
            "message": "Passwords do not match.",
        }, status=400)

    if len(username) > 150:
        return JsonResponse({
            "success": False,
            "message": "Username must not exceed 150 characters.",
        }, status=400)

    if User.objects.filter(username__iexact=username).exists():
        return JsonResponse({
            "success": False,
            "message": "This username is already registered.",
        }, status=409)

    if User.objects.filter(email__iexact=email).exists():
        return JsonResponse({
            "success": False,
            "message": "This email address is already registered.",
        }, status=409)

    try:
        validate_password(password)
    except ValidationError as error:
        return JsonResponse({
            "success": False,
            "message": "Please choose a stronger password.",
            "errors": list(error.messages),
        }, status=400)

    try:
        with transaction.atomic():
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                first_name=first_name,
                last_name=last_name,
            )

            # Every public registration receives the standard user role.
            UserProfile.objects.create(
                user=user,
                role="user",
            )

        login(request, user)

        return JsonResponse({
            "success": True,
            "message": "Registration successful.",
            "user": user_response_data(user),
        }, status=201)

    except Exception:
        return JsonResponse({
            "success": False,
            "message": "Unable to complete registration. Please try again.",
        }, status=500)


@require_POST
@csrf_protect
def user_login(request):
    """Authenticate a user and create a Django session."""

    data = get_request_data(request)

    if data is None:
        return JsonResponse({
            "success": False,
            "message": "Invalid JSON request.",
        }, status=400)

    identifier = str(data.get("username", "")).strip()
    password = data.get("password", "")

    if not identifier or not password:
        return JsonResponse({
            "success": False,
            "message": "Username/email and password are required.",
        }, status=400)

    if not isinstance(password, str):
        return JsonResponse({
            "success": False,
            "message": "Invalid password.",
        }, status=400)

    username = identifier

    if "@" in identifier:
        matched_user = User.objects.filter(
            email__iexact=identifier
        ).first()

        if matched_user:
            username = matched_user.username

    user = authenticate(
        request,
        username=username,
        password=password,
    )

    if user is None:
        return JsonResponse({
            "success": False,
            "message": "Invalid username/email or password.",
        }, status=401)

    if not user.is_active:
        return JsonResponse({
            "success": False,
            "message": "This account is inactive.",
        }, status=403)

    # Create a default profile for existing accounts if necessary.
    get_or_create_user_profile(user)

    login(request, user)

    return JsonResponse({
        "success": True,
        "message": "Login successful.",
        "user": user_response_data(user),
    })


@require_POST
@csrf_protect
def user_logout(request):
    """End the current user's Django session."""

    if not request.user.is_authenticated:
        return JsonResponse({
            "success": True,
            "message": "You are already logged out.",
        })

    logout(request)

    return JsonResponse({
        "success": True,
        "message": "Logout successful.",
    })


@require_GET
def current_user(request):
    """Return the currently authenticated user."""

    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "authenticated": False,
            "message": "Authentication required.",
        }, status=401)

    return JsonResponse({
        "success": True,
        "authenticated": True,
        "user": user_response_data(request.user),
    })


# ==========================================
# ADMIN USER MANAGEMENT
# ==========================================

def count_active_admins():
    """Count active administrator accounts."""
    return User.objects.filter(
        is_active=True
    ).filter(
        Q(is_staff=True) |
        Q(is_superuser=True) |
        Q(profile__role="admin")
    ).distinct().count()


@require_GET
@role_required("admin")
def admin_user_list(request):
    """Return all registered users for the admin dashboard."""

    users = User.objects.all().order_by("-date_joined")

    user_data = [
        {
            **user_response_data(user),
            "is_active": user.is_active,
            "date_joined": user.date_joined.isoformat(),
        }
        for user in users
    ]

    return JsonResponse({
        "success": True,
        "total_users": len(user_data),
        "users": user_data,
    })


@require_POST
@csrf_protect
@role_required("admin")
def admin_update_user_role(request, user_id):
    """Change another user's role."""

    data = get_request_data(request)

    if data is None:
        return JsonResponse({
            "success": False,
            "message": "Invalid JSON request.",
        }, status=400)

    new_role = data.get("role")

    allowed_roles = ["admin", "user", "viewer"]

    if new_role not in allowed_roles:
        return JsonResponse({
            "success": False,
            "message": "Invalid role selected.",
        }, status=400)

    target_user = User.objects.filter(id=user_id).first()

    if target_user is None:
        return JsonResponse({
            "success": False,
            "message": "User not found.",
        }, status=404)

    if target_user.id == request.user.id:
        return JsonResponse({
            "success": False,
            "message": "You cannot change your own role.",
        }, status=403)

    if target_user.is_staff or target_user.is_superuser:
        return JsonResponse({
            "success": False,
            "message": "Django staff and superuser roles cannot be changed here.",
        }, status=403)

    profile = get_or_create_user_profile(target_user)

    if profile.role == "admin" and new_role != "admin":
        if count_active_admins() <= 1:
            return JsonResponse({
                "success": False,
                "message": "You cannot remove the last active administrator.",
            }, status=400)

    profile.role = new_role
    profile.save(update_fields=["role"])

    return JsonResponse({
        "success": True,
        "message": "User role updated successfully.",
        "user": user_response_data(target_user),
    })


@require_POST
@csrf_protect
@role_required("admin")
def admin_update_user_status(request, user_id):
    """Activate or deactivate another user's account."""

    data = get_request_data(request)

    if data is None:
        return JsonResponse({
            "success": False,
            "message": "Invalid JSON request.",
        }, status=400)

    is_active = data.get("is_active")

    if not isinstance(is_active, bool):
        return JsonResponse({
            "success": False,
            "message": "is_active must be true or false.",
        }, status=400)

    target_user = User.objects.filter(id=user_id).first()

    if target_user is None:
        return JsonResponse({
            "success": False,
            "message": "User not found.",
        }, status=404)

    if target_user.id == request.user.id:
        return JsonResponse({
            "success": False,
            "message": "You cannot change your own account status.",
        }, status=403)

    if target_user.is_staff or target_user.is_superuser:
        return JsonResponse({
            "success": False,
            "message": "Django staff and superuser accounts cannot be modified here.",
        }, status=403)

    profile = get_or_create_user_profile(target_user)

    if profile.role == "admin" and not is_active:
        if count_active_admins() <= 1:
            return JsonResponse({
                "success": False,
                "message": "You cannot deactivate the last active administrator.",
            }, status=400)

    target_user.is_active = is_active
    target_user.save(update_fields=["is_active"])

    return JsonResponse({
        "success": True,
        "message": (
            "User activated successfully."
            if is_active
            else "User deactivated successfully."
        ),
        "user": {
            **user_response_data(target_user),
            "is_active": target_user.is_active,
        },
    })
