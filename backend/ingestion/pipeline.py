import logging
import mimetypes
from pathlib import Path
from uuid import uuid4

from backend.core.config import get_settings
from backend.db.postgres import (
    archive_chunk_rows,
    fetch_library_file,
    list_active_vector_ids,
    mark_failed,
    mark_processing,
    mark_ready,
    record_chunks,
)
from backend.ingestion.chunking import build_chunks
from backend.ingestion.embeddings import get_embedding_provider
from backend.ingestion.extractors import extract_text
from backend.services.notifications import notify_ingestion_failed
from backend.services.storage import download_to_tempfile, head_object
from backend.services.vector_store import get_vector_store

logger = logging.getLogger(__name__)

ALLOWED_MIME_BY_EXT = {
    ".pdf": {"application/pdf"},
    ".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    ".pptx": {"application/vnd.openxmlformats-officedocument.presentationml.presentation"},
    ".txt": {"text/plain"},
    ".md": {"text/markdown", "text/plain"},
    ".vtt": {"text/vtt", "text/plain"},
    ".srt": {"application/x-subrip", "text/plain"},
}


def new_version_stamp() -> str:
    return uuid4().hex


def ingest_file(file_id: str, course_id: str, version_stamp: str | None = None) -> None:
    row = fetch_library_file(file_id, course_id)
    if not row:
        raise ValueError("file_not_found")

    version = version_stamp or row.get("version_stamp") or new_version_stamp()
    try:
        mark_processing(file_id, course_id, version)
        row = fetch_library_file(file_id, course_id)
        if not row:
            raise ValueError("file_not_found")

        extension = _extension(row["file_name"])
        _validate_file_metadata(row, extension)
        downloaded = download_to_tempfile(row["file_key"], extension)
        try:
            _validate_object_metadata(row, extension, downloaded.content_type, downloaded.content_length)
            sections = extract_text(downloaded.path, extension)
        finally:
            downloaded.path.unlink(missing_ok=True)

        chunks = build_chunks(
            sections,
            course_id=course_id,
            file_id=file_id,
            file_name=row["file_name"],
            upload_date=row["created_at"].isoformat() if row.get("created_at") else "",
            version_stamp=version,
        )
        if not chunks:
            raise ValueError("no_extractable_text")

        existing = list_active_vector_ids(file_id)
        vector_store = get_vector_store()
        if existing:
            vector_store.archive_vectors(course_id, [item["vector_id"] for item in existing])
            archive_chunk_rows(file_id)

        vectors = get_embedding_provider().embed_documents([chunk.text for chunk in chunks])
        vector_items: list[dict] = []
        chunk_rows: list[dict] = []
        for chunk, embedding in zip(chunks, vectors, strict=True):
            vector_id = _vector_id(course_id, file_id, version, chunk.metadata["chunkIndex"])
            metadata = {
                **chunk.metadata,
                "text": chunk.text,
            }
            vector_items.append({"id": vector_id, "values": embedding, "metadata": metadata})
            chunk_rows.append(
                {
                    "vector_id": vector_id,
                    "course_id": course_id,
                    "file_id": file_id,
                    "file_name": row["file_name"],
                    "version_stamp": version,
                    "page_number": chunk.metadata["pageNumber"],
                    "chunk_index": chunk.metadata["chunkIndex"],
                    "metadata": metadata,
                }
            )

        vector_store.upsert(course_id, vector_items)
        record_chunks(chunk_rows)
        mark_ready(file_id, course_id)
    except Exception as error:
        message = str(error)
        logger.exception("RAG ingestion failed for file %s", file_id)
        mark_failed(file_id, course_id, message)
        notify_ingestion_failed(course_id, file_id, row.get("file_name", "uploaded file"), message)
        raise


def archive_file(file_id: str, course_id: str | None = None) -> None:
    row = fetch_library_file(file_id, course_id)
    if not row:
        raise ValueError("file_not_found")
    active = list_active_vector_ids(file_id)
    if active:
        get_vector_store().archive_vectors(row["course_id"], [item["vector_id"] for item in active])
    archive_chunk_rows(file_id)


def validate_pending_file(file_id: str, course_id: str) -> str:
    row = fetch_library_file(file_id, course_id)
    if not row:
        raise ValueError("file_not_found")
    extension = _extension(row["file_name"])
    _validate_file_metadata(row, extension)
    object_meta = head_object(row["file_key"])
    _validate_object_metadata(
        row,
        extension,
        object_meta.get("ContentType"),
        int(object_meta.get("ContentLength") or row["size"] or 0),
    )
    return row.get("version_stamp") or new_version_stamp()


def _extension(file_name: str) -> str:
    extension = Path(file_name).suffix.lower()
    if extension not in ALLOWED_MIME_BY_EXT:
        raise ValueError(f"unsupported_file_type:{extension}")
    return extension


def _validate_file_metadata(row: dict, extension: str) -> None:
    declared_mime = _clean_mime(row.get("mime_type") or mimetypes.guess_type(row["file_name"])[0])
    if declared_mime not in ALLOWED_MIME_BY_EXT[extension]:
        raise ValueError(f"mime_mismatch:{declared_mime}:{extension}")
    size = int(row.get("size") or 0)
    _validate_size(extension, size)


def _validate_object_metadata(row: dict, extension: str, content_type: str | None, content_length: int) -> None:
    object_mime = _clean_mime(content_type)
    if object_mime and object_mime not in ALLOWED_MIME_BY_EXT[extension]:
        raise ValueError(f"mime_mismatch:{object_mime}:{extension}")
    _validate_size(extension, content_length or int(row.get("size") or 0))


def _validate_size(extension: str, size: int) -> None:
    settings = get_settings()
    limit = settings.text_size_limit_bytes if extension in {".txt", ".md", ".vtt", ".srt"} else settings.pdf_doc_pptx_size_limit_bytes
    if size <= 0:
        raise ValueError("empty_file")
    if size > limit:
        raise ValueError("file_too_large")


def _clean_mime(value: str | None) -> str | None:
    return value.split(";", 1)[0].strip().lower() if value else None


def _vector_id(course_id: str, file_id: str, version_stamp: str, chunk_index: int) -> str:
    return f"{course_id}:{file_id}:{version_stamp}:{chunk_index}"
