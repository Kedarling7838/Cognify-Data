
from django.conf import settings
from django.db import models


class Dataset(models.Model):
    # Dataset owner.
    # Nullable initially to preserve existing datasets during migration.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="datasets",
        null=True,
        blank=True,
    )

    filename = models.CharField(max_length=255)
    file_type = models.CharField(max_length=10)

    uploaded_file = models.FileField(
        upload_to="datasets/",
        null=True,
        blank=True,
    )

    rows_count = models.PositiveIntegerField(default=0)
    columns_count = models.PositiveIntegerField(default=0)
    missing_values = models.PositiveIntegerField(default=0)
    duplicate_rows = models.PositiveIntegerField(default=0)

    columns = models.JSONField(default=list)
    preview = models.JSONField(default=list)

    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self):
        return self.filename
