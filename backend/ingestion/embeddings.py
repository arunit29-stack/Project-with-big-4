import hashlib
import math
import time
from typing import Protocol

from langchain_openai import OpenAIEmbeddings

from backend.core.config import get_settings


class EmbeddingProvider(Protocol):
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        ...

    def embed_query(self, text: str) -> list[float]:
        ...


class OpenAIEmbeddingProvider:
    def __init__(self) -> None:
        settings = get_settings()
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai")
        self.embeddings = OpenAIEmbeddings(
            model=settings.openai_embedding_model,
            dimensions=settings.embedding_dimensions,
            openai_api_key=settings.openai_api_key,
            chunk_size=settings.embed_batch_size,
            max_retries=0,
        )

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        settings = get_settings()
        vectors: list[list[float]] = []
        for start in range(0, len(texts), settings.embed_batch_size):
            batch = texts[start : start + settings.embed_batch_size]
            vectors.extend(_with_backoff(lambda: self.embeddings.embed_documents(batch)))
        return vectors

    def embed_query(self, text: str) -> list[float]:
        return _with_backoff(lambda: self.embeddings.embed_query(text))


class LocalHashEmbeddingProvider:
    """Deterministic local fallback for development and isolated test environments."""

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [_hash_embedding(text, get_settings().embedding_dimensions) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        return _hash_embedding(text, get_settings().embedding_dimensions)


def _with_backoff(operation):
    settings = get_settings()
    last_error: Exception | None = None
    for attempt in range(settings.embed_max_retries):
        try:
            return operation()
        except Exception as error:
            last_error = error
            if attempt == settings.embed_max_retries - 1:
                break
            time.sleep(min(30, 2**attempt))
    raise RuntimeError(f"embedding_failed_after_retries:{last_error}") from last_error


def _hash_embedding(text: str, dimensions: int) -> list[float]:
    values = [0.0] * dimensions
    tokens = text.lower().split()
    for token in tokens or [text]:
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=16).digest()
        index = int.from_bytes(digest[:8], "big") % dimensions
        sign = 1.0 if digest[8] % 2 == 0 else -1.0
        values[index] += sign
    norm = math.sqrt(sum(value * value for value in values)) or 1.0
    return [value / norm for value in values]


def get_embedding_provider() -> EmbeddingProvider:
    if get_settings().embedding_provider == "local":
        return LocalHashEmbeddingProvider()
    return OpenAIEmbeddingProvider()
