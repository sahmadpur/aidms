import io
import uuid

from minio import Minio
from minio.error import S3Error

from app.core.config import settings

_client: Minio | None = None


def get_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
    return _client


def ensure_bucket() -> None:
    client = get_client()
    if not client.bucket_exists(settings.minio_bucket_name):
        client.make_bucket(settings.minio_bucket_name)
        # Block all public access
        import json
        policy = json.dumps({
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Deny",
                    "Principal": "*",
                    "Action": "s3:*",
                    "Resource": [
                        f"arn:aws:s3:::{settings.minio_bucket_name}",
                        f"arn:aws:s3:::{settings.minio_bucket_name}/*",
                    ],
                    "Condition": {
                        "StringNotEquals": {
                            "aws:PrincipalArn": [
                                f"arn:aws:iam:::user/{settings.minio_access_key}"
                            ]
                        }
                    },
                }
            ],
        })
        try:
            client.set_bucket_policy(settings.minio_bucket_name, policy)
        except S3Error:
            pass  # Policy may not be supported in all MinIO versions


async def upload_file(data: bytes, original_filename: str, content_type: str = "application/pdf") -> str:
    """Upload file bytes to MinIO. Returns the object key."""
    client = get_client()
    key = f"documents/{uuid.uuid4()}.pdf"
    client.put_object(
        settings.minio_bucket_name,
        key,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )
    return key


def get_file_stream(object_key: str):
    """Return a readable stream from MinIO (sync — for use in background workers)."""
    client = get_client()
    return client.get_object(settings.minio_bucket_name, object_key)


async def delete_file(object_key: str) -> None:
    client = get_client()
    client.remove_object(settings.minio_bucket_name, object_key)
