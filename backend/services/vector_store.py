import json
from abc import ABC, abstractmethod
from typing import Any

from backend.core.config import get_settings
from backend.db.postgres import get_conn


class VectorStore(ABC):
    @abstractmethod
    def upsert(self, course_id: str, vectors: list[dict[str, Any]]) -> None:
        """Upsert vectors into the course-isolated namespace."""

    @abstractmethod
    def archive_vectors(self, course_id: str, vector_ids: list[str]) -> None:
        """Soft-delete vectors from active retrieval by setting archived=true."""

    @abstractmethod
    def query_course(self, course_id: str, embedding: list[float], top_k: int) -> list[dict[str, Any]]:
        """Retrieve only from the course namespace and only active chunks."""


class PineconeVectorStore(VectorStore):
    def __init__(self) -> None:
        from pinecone import Pinecone

        settings = get_settings()
        if not settings.pinecone_api_key:
            raise ValueError("PINECONE_API_KEY is required for Pinecone vector storage")
        self.index = Pinecone(api_key=settings.pinecone_api_key).Index(settings.pinecone_index_name)

    def upsert(self, course_id: str, vectors: list[dict[str, Any]]) -> None:
        for start in range(0, len(vectors), 100):
            batch = vectors[start : start + 100]
            self.index.upsert(
                vectors=[
                    {
                        "id": item["id"],
                        "values": item["values"],
                        "metadata": item["metadata"],
                    }
                    for item in batch
                ],
                namespace=course_id,
            )

    def archive_vectors(self, course_id: str, vector_ids: list[str]) -> None:
        for vector_id in vector_ids:
            self.index.update(
                id=vector_id,
                set_metadata={"archived": True},
                namespace=course_id,
            )

    def query_course(self, course_id: str, embedding: list[float], top_k: int) -> list[dict[str, Any]]:
        result = self.index.query(
            vector=embedding,
            top_k=top_k,
            namespace=course_id,
            filter={"courseId": {"$eq": course_id}, "archived": {"$eq": False}},
            include_metadata=True,
        )
        return list(getattr(result, "matches", []) or result.get("matches", []))


class PgVectorStore(VectorStore):
    def upsert(self, course_id: str, vectors: list[dict[str, Any]]) -> None:
        with get_conn() as conn:
            for item in vectors:
                metadata = item["metadata"]
                conn.execute(
                    """
                    INSERT INTO rag_vectors (
                      id, course_id, file_id, embedding, metadata, archived, updated_at
                    )
                    VALUES (%s,%s,%s,%s::vector,%s,FALSE,NOW())
                    ON CONFLICT (id) DO UPDATE SET
                      embedding = EXCLUDED.embedding,
                      metadata = EXCLUDED.metadata,
                      archived = FALSE,
                      updated_at = NOW()
                    """,
                    [
                        item["id"],
                        course_id,
                        metadata["fileId"],
                        _vector_literal(item["values"]),
                        json.dumps(metadata),
                    ],
                )
            conn.commit()

    def archive_vectors(self, course_id: str, vector_ids: list[str]) -> None:
        if not vector_ids:
            return
        with get_conn() as conn:
            conn.execute(
                """
                UPDATE rag_vectors
                SET archived = TRUE,
                    metadata = jsonb_set(metadata, '{archived}', 'true'::jsonb, true),
                    updated_at = NOW()
                WHERE course_id = %s
                  AND id = ANY(%s)
                """,
                [course_id, vector_ids],
            )
            conn.commit()

    def query_course(self, course_id: str, embedding: list[float], top_k: int) -> list[dict[str, Any]]:
        with get_conn() as conn:
            rows = conn.execute(
                """
                SELECT id, metadata, 1 - (embedding <=> %s::vector) AS score
                FROM rag_vectors
                WHERE course_id = %s
                  AND archived = FALSE
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                [_vector_literal(embedding), course_id, _vector_literal(embedding), top_k],
            ).fetchall()
            return [dict(row) for row in rows]


def _vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in values) + "]"


def get_vector_store() -> VectorStore:
    if get_settings().vector_backend == "pgvector":
        return PgVectorStore()
    return PineconeVectorStore()
