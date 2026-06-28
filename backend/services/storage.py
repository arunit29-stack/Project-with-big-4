import tempfile
from dataclasses import dataclass
from pathlib import Path

import boto3

from backend.core.config import get_settings


@dataclass(frozen=True)
class DownloadedObject:
    path: Path
    content_type: str | None
    content_length: int


def _client():
    settings = get_settings()
    return boto3.client(
        "s3",
        region_name=settings.object_region,
        endpoint_url=settings.object_endpoint_url,
        aws_access_key_id=settings.object_access_key_id,
        aws_secret_access_key=settings.object_secret_access_key,
    )


def head_object(file_key: str) -> dict:
    return _client().head_object(Bucket=get_settings().object_bucket, Key=file_key)


def download_to_tempfile(file_key: str, suffix: str) -> DownloadedObject:
    client = _client()
    head = client.head_object(Bucket=get_settings().object_bucket, Key=file_key)
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        client.download_fileobj(get_settings().object_bucket, file_key, tmp)
        path = Path(tmp.name)
    return DownloadedObject(
        path=path,
        content_type=head.get("ContentType"),
        content_length=int(head.get("ContentLength") or path.stat().st_size),
    )
