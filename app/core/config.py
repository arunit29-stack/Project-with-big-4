from functools import lru_cache
from typing import Literal

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(alias="DATABASE_URL")
    redis_url: str = Field(alias="REDIS_URL")
    internal_service_api_key: str = Field(alias="INTERNAL_SERVICE_API_KEY")

    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    anthropic_api_key: str | None = Field(default=None, alias="ANTHROPIC_API_KEY")
    openai_embedding_model: str = Field(default="text-embedding-3-small", alias="OPENAI_EMBEDDING_MODEL")
    embedding_dimensions: int = Field(default=1536, alias="EMBEDDING_DIMENSIONS")
    embedding_provider: Literal["openai", "local"] = Field(default="openai", alias="EMBEDDING_PROVIDER")

    vector_backend: Literal["pinecone", "pgvector"] = Field(default="pinecone", alias="VECTOR_BACKEND")
    pinecone_api_key: str | None = Field(default=None, alias="PINECONE_API_KEY")
    pinecone_index_name: str = Field(default="cbb-course-content", alias="PINECONE_INDEX_NAME")

    s3_bucket: str | None = Field(default=None, alias="S3_BUCKET")
    s3_region: str = Field(default="us-east-1", alias="S3_REGION")
    s3_endpoint_url: str | None = Field(default=None, alias="S3_ENDPOINT_URL")
    aws_access_key_id: str | None = Field(default=None, alias="AWS_ACCESS_KEY_ID")
    aws_secret_access_key: str | None = Field(default=None, alias="AWS_SECRET_ACCESS_KEY")

    r2_account_id: str | None = Field(default=None, alias="R2_ACCOUNT_ID")
    r2_bucket_name: str | None = Field(default=None, alias="R2_BUCKET_NAME")
    r2_access_key_id: str | None = Field(default=None, alias="R2_ACCESS_KEY_ID")
    r2_secret_access_key: str | None = Field(default=None, alias="R2_SECRET_ACCESS_KEY")

    pdf_doc_pptx_size_limit_bytes: int = 50 * 1024 * 1024
    text_size_limit_bytes: int = 10 * 1024 * 1024
    embed_batch_size: int = 100
    embed_max_retries: int = 5

    @computed_field
    @property
    def object_bucket(self) -> str:
        bucket = self.r2_bucket_name or self.s3_bucket
        if not bucket:
            raise ValueError("R2_BUCKET_NAME or S3_BUCKET is required")
        return bucket

    @computed_field
    @property
    def object_region(self) -> str:
        return "auto" if self.r2_account_id else self.s3_region

    @computed_field
    @property
    def object_endpoint_url(self) -> str | None:
        if self.s3_endpoint_url:
            return self.s3_endpoint_url
        if self.r2_account_id:
            return f"https://{self.r2_account_id}.r2.cloudflarestorage.com"
        return None

    @computed_field
    @property
    def object_access_key_id(self) -> str | None:
        return self.r2_access_key_id or self.aws_access_key_id

    @computed_field
    @property
    def object_secret_access_key(self) -> str | None:
        return self.r2_secret_access_key or self.aws_secret_access_key


@lru_cache
def get_settings() -> Settings:
    return Settings()
