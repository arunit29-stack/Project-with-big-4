import json
import logging
from typing import Any

import redis
from psycopg.types.json import Jsonb

from app.core.config import get_settings
from app.db.postgres import get_conn

logger = logging.getLogger(__name__)


def _teacher_rows(course_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn:
        return [
            dict(row)
            for row in conn.execute(
                """
                SELECT
                  tc.teacher_id,
                  tc.course_id,
                  c.name AS course_name
                FROM teacher_courses tc
                LEFT JOIN courses c ON c.id = tc.course_id
                WHERE tc.course_id = %s
                """,
                [course_id],
            ).fetchall()
        ]


def notify_ingestion_failed(course_id: str, file_id: str, file_name: str, error: str) -> None:
    try:
        teachers = _teacher_rows(course_id)
    except Exception:
        logger.exception("Unable to load teachers for ingestion failure notification")
        return

    if not teachers:
        return

    try:
        publisher = redis.Redis.from_url(get_settings().redis_url, decode_responses=True)
    except Exception:
        publisher = None

    for teacher in teachers:
        payload = {
            "courseId": course_id,
            "courseName": teacher.get("course_name"),
            "fileId": file_id,
            "fileName": file_name,
            "message": f"Could not process {file_name}. {error[:240]}",
            "navigateTo": f"/dashboard/{course_id}",
        }
        try:
            with get_conn() as conn:
                row = conn.execute(
                    """
                    INSERT INTO notifications (
                      user_id, type, course_id, course_name, message, navigate_to, payload
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, type, course_id, course_name, message, navigate_to, created_at
                    """,
                    [
                        teacher["teacher_id"],
                        "content_processing_failed",
                        course_id,
                        teacher.get("course_name"),
                        payload["message"],
                        payload["navigateTo"],
                        Jsonb(payload),
                    ],
                ).fetchone()
                conn.commit()
            if publisher and row:
                publisher.publish(
                    f"notifications:{teacher['teacher_id']}",
                    json.dumps({"userId": teacher["teacher_id"], **dict(row)}, default=str),
                )
        except Exception:
            logger.exception("Unable to notify teacher about ingestion failure")
