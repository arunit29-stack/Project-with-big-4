from celery import Celery

from backend.core.config import get_settings
from backend.ingestion.pipeline import ingest_file

settings = get_settings()

celery_app = Celery(
    "cbb_ai_service",
    broker=settings.redis_url,
    backend=settings.redis_url,
)
celery_app.conf.task_routes = {"app.worker.ingest_file_task": {"queue": "rag-ingestion"}}
celery_app.conf.task_acks_late = True
celery_app.conf.worker_prefetch_multiplier = 1


@celery_app.task(name="app.worker.ingest_file_task", bind=True)
def ingest_file_task(self, file_id: str, course_id: str, version_stamp: str) -> None:
    ingest_file(file_id=file_id, course_id=course_id, version_stamp=version_stamp)
