from django.http import JsonResponse


class DatasetAuthenticationMiddleware:
    """
    Require an authenticated user for dataset API endpoints.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):

        # Allow CORS preflight requests
        if request.method == "OPTIONS":
            return self.get_response(request)

        # Protect dataset API endpoints
        if request.path.startswith("/api/datasets/"):

            if not request.user.is_authenticated:
                return JsonResponse(
                    {
                        "success": False,
                        "error": "Authentication required. Please log in."
                    },
                    status=401
                )

        return self.get_response(request)