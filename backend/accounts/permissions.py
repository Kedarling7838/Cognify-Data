from functools import wraps
from django.http import JsonResponse


def get_user_role(user):
    if not user.is_authenticated:
        return None

    if user.is_staff or user.is_superuser:
        return "admin"

    profile = getattr(user, "profile", None)

    if profile:
        return profile.role

    return "user"


def role_required(*allowed_roles):
    def decorator(view_func):

        @wraps(view_func)
        def wrapper(request, *args, **kwargs):

            if not request.user.is_authenticated:
                return JsonResponse({
                    "success": False,
                    "message": "Authentication required."
                }, status=401)

            role = get_user_role(request.user)

            if role not in allowed_roles:
                return JsonResponse({
                    "success": False,
                    "message": "You do not have permission to perform this action."
                }, status=403)

            return view_func(request, *args, **kwargs)

        return wrapper

    return decorator