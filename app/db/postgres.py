from contextlib import contextmanager
from typing import Any, Iterator

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from app.core.config import get_settings

_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(get_settings().database_url, kwargs={"row_factory": dict_row})
    return _pool


@contextmanager
def get_conn() -> Iterator[Any]:
    with get_pool().connection() as conn:
        yield conn


def init_schema() -> None:
    settings = get_settings()
    with get_conn() as conn:
        conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
        if settings.vector_backend == "pgvector":
            conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS rag_vectors (
                  id TEXT PRIMARY KEY,
                  course_id TEXT NOT NULL,
                  file_id TEXT NOT NULL,
                  embedding vector({settings.embedding_dimensions}) NOT NULL,
                  metadata JSONB NOT NULL,
                  archived BOOLEAN NOT NULL DEFAULT FALSE,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS rag_vectors_course_active_idx ON rag_vectors(course_id, archived)")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS rag_chunks (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              vector_id TEXT NOT NULL UNIQUE,
              course_id TEXT NOT NULL,
              file_id UUID NOT NULL,
              file_name TEXT NOT NULL,
              version_stamp TEXT NOT NULL,
              page_number INT,
              chunk_index INT NOT NULL,
              archived BOOLEAN NOT NULL DEFAULT FALSE,
              metadata JSONB NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS rag_chunks_file_active_idx ON rag_chunks(file_id, archived)")
        conn.execute("CREATE INDEX IF NOT EXISTS rag_chunks_course_active_idx ON rag_chunks(course_id, archived)")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_query_logs (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              student_id TEXT NOT NULL,
              course_id TEXT NOT NULL,
              query_text TEXT NOT NULL,
              ai_response TEXT NOT NULL,
              source_chunk_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
              lock_mode_active BOOLEAN NOT NULL DEFAULT FALSE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS ai_query_logs_course_created_idx ON ai_query_logs(course_id, created_at DESC)")
        conn.execute("CREATE INDEX IF NOT EXISTS ai_query_logs_student_idx ON ai_query_logs(student_id)")

        conn.execute(
            """
            DO $$
            BEGIN
              IF to_regclass('public.course_library_files') IS NOT NULL THEN
                ALTER TABLE course_library_files ADD COLUMN IF NOT EXISTS version_stamp TEXT;
                ALTER TABLE course_library_files ADD COLUMN IF NOT EXISTS ingestion_error TEXT;
                ALTER TABLE course_library_files ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
                ALTER TABLE course_library_files ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
              END IF;
              IF to_regclass('public.assignments') IS NOT NULL THEN
                ALTER TABLE assignments ADD COLUMN IF NOT EXISTS assignment_lock_mode BOOLEAN NOT NULL DEFAULT FALSE;
              END IF;
            END $$;
            """
        )
        conn.commit()


def fetch_library_file(file_id: str, course_id: str | None = None) -> dict[str, Any] | None:
    where = "id = %s"
    params: list[Any] = [file_id]
    if course_id:
        where += " AND course_id = %s"
        params.append(course_id)
    with get_conn() as conn:
        row = conn.execute(
            f"""
            SELECT
              id,
              course_id,
              file_name,
              file_key,
              mime_type,
              size,
              status,
              created_at,
              version_stamp,
              ingestion_error,
              COALESCE(archived, FALSE) AS archived,
              processed_at
            FROM course_library_files
            WHERE {where}
              AND deleted_at IS NULL
            LIMIT 1
            """,
            params,
        ).fetchone()
        return dict(row) if row else None


def mark_processing(file_id: str, course_id: str, version_stamp: str) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE course_library_files
            SET status = 'processing',
                version_stamp = %s,
                ingestion_error = NULL,
                processed_at = NULL,
                updated_at = NOW()
            WHERE id = %s AND course_id = %s
            """,
            [version_stamp, file_id, course_id],
        )
        conn.commit()


def mark_ready(file_id: str, course_id: str) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE course_library_files
            SET status = 'ready',
                ingestion_error = NULL,
                processed_at = NOW(),
                updated_at = NOW()
            WHERE id = %s AND course_id = %s
            """,
            [file_id, course_id],
        )
        conn.commit()


def mark_failed(file_id: str, course_id: str, error: str) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE course_library_files
            SET status = 'failed',
                ingestion_error = %s,
                updated_at = NOW()
            WHERE id = %s AND course_id = %s
            """,
            [error[:4000], file_id, course_id],
        )
        conn.commit()


def list_active_vector_ids(file_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT vector_id, course_id
            FROM rag_chunks
            WHERE file_id = %s AND archived = FALSE
            """,
            [file_id],
        ).fetchall()
        return [dict(row) for row in rows]


def archive_chunk_rows(file_id: str) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE rag_chunks
            SET archived = TRUE,
                metadata = jsonb_set(metadata, '{archived}', 'true'::jsonb, true),
                updated_at = NOW()
            WHERE file_id = %s AND archived = FALSE
            """,
            [file_id],
        )
        conn.execute(
            """
            UPDATE course_library_files
            SET archived = TRUE,
                updated_at = NOW()
            WHERE id = %s
            """,
            [file_id],
        )
        conn.commit()


def record_chunks(chunks: list[dict[str, Any]]) -> None:
    if not chunks:
        return
    with get_conn() as conn:
        for chunk in chunks:
            conn.execute(
                """
                INSERT INTO rag_chunks (
                  vector_id, course_id, file_id, file_name, version_stamp,
                  page_number, chunk_index, archived, metadata
                )
                VALUES (%s,%s,%s,%s,%s,%s,%s,FALSE,%s)
                ON CONFLICT (vector_id) DO UPDATE SET
                  archived = FALSE,
                  metadata = EXCLUDED.metadata,
                  updated_at = NOW()
                """,
                [
                    chunk["vector_id"],
                    chunk["course_id"],
                    chunk["file_id"],
                    chunk["file_name"],
                    chunk["version_stamp"],
                    chunk["page_number"],
                    chunk["chunk_index"],
                    Jsonb(chunk["metadata"]),
                ],
            )
        conn.commit()


def get_file_status(file_id: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT
              f.id AS file_id,
              f.course_id,
              f.file_name,
              f.status,
              f.version_stamp,
              f.created_at AS upload_date,
              f.processed_at,
              f.ingestion_error AS error,
              COALESCE(f.archived, FALSE) AS archived,
              COUNT(c.id)::int AS chunk_count
            FROM course_library_files f
            LEFT JOIN rag_chunks c
              ON c.file_id = f.id
             AND c.archived = FALSE
            WHERE f.id = %s
            GROUP BY f.id
            LIMIT 1
            """,
            [file_id],
        ).fetchone()
        return dict(row) if row else None


def get_course_name(course_id: str) -> str:
    try:
        with get_conn() as conn:
            row = conn.execute("SELECT name FROM courses WHERE id = %s LIMIT 1", [course_id]).fetchone()
            return str(row["name"]) if row and row.get("name") else "this course"
    except Exception:
        return "this course"


def is_assignment_lock_mode_active(course_id: str) -> bool:
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT EXISTS (
              SELECT 1
              FROM assignments
              WHERE course_id = %s
                AND assignment_lock_mode = TRUE
                AND deadline_utc >= NOW()
            ) AS active
            """,
            [course_id],
        ).fetchone()
        return bool(row and row["active"])


def insert_ai_query_log(
    *,
    student_id: str,
    course_id: str,
    query_text: str,
    ai_response: str,
    source_chunk_ids: list[str],
    lock_mode_active: bool,
) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO ai_query_logs (
              student_id, course_id, query_text, ai_response, source_chunk_ids, lock_mode_active
            )
            VALUES (%s,%s,%s,%s,%s,%s)
            """,
            [student_id, course_id, query_text, ai_response, Jsonb(source_chunk_ids), lock_mode_active],
        )
        conn.commit()


def list_ai_query_logs(
    *,
    course_id: str,
    student_id: str | None,
    start_date: str | None,
    end_date: str | None,
    page: int,
    limit: int,
) -> dict[str, Any]:
    clauses = ["course_id = %s"]
    params: list[Any] = [course_id]
    if student_id:
        clauses.append("student_id = %s")
        params.append(student_id)
    if start_date:
        clauses.append("created_at >= %s")
        params.append(start_date)
    if end_date:
        clauses.append("created_at <= %s")
        params.append(end_date)
    where = " AND ".join(clauses)
    offset = (page - 1) * limit

    with get_conn() as conn:
        items = conn.execute(
            f"""
            SELECT
              id,
              student_id,
              course_id,
              query_text,
              ai_response,
              source_chunk_ids,
              lock_mode_active,
              created_at
            FROM ai_query_logs
            WHERE {where}
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
            """,
            [*params, limit, offset],
        ).fetchall()
        total_row = conn.execute(
            f"SELECT COUNT(*)::int AS total FROM ai_query_logs WHERE {where}",
            params,
        ).fetchone()
    return {"items": [dict(row) for row in items], "total": int(total_row["total"] if total_row else 0)}
