from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException

from backend.api.schemas import (
    ArchiveRequest,
    AiQuizGenerationRequest,
    AiQuizGenerationResponse,
    IngestRequest,
    InternalChatRequest,
    InternalChatResponse,
    QueryLogItem,
    QueryLogsResponse,
    RetryRequest,
    StatusResponse,
    TaskResponse,
)
from backend.core.security import require_internal_api_key
from backend.db.postgres import fetch_library_file, get_file_status, init_schema, list_ai_query_logs, mark_processing
from backend.ingestion.pipeline import archive_file, new_version_stamp
from backend.services.chat import answer_course_chat
from backend.services.quiz_generation import QuizGenerationError, generate_quiz_questions
from backend.worker import ingest_file_task


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_schema()
    yield


app = FastAPI(title="CBB AI Service", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/pipeline/ingest", response_model=TaskResponse, dependencies=[Depends(require_internal_api_key)])
async def ingest(request: IngestRequest) -> TaskResponse:
    row = fetch_library_file(request.file_id, request.course_id)
    if not row:
        raise HTTPException(status_code=404, detail="file_not_found")
    version_stamp = row.get("version_stamp") or new_version_stamp()
    mark_processing(request.file_id, request.course_id, version_stamp)

    task = ingest_file_task.delay(request.file_id, request.course_id, version_stamp)
    return TaskResponse(
        ok=True,
        fileId=request.file_id,
        courseId=request.course_id,
        versionStamp=version_stamp,
        taskId=task.id,
        status="processing",
    )


@app.get("/pipeline/status/{file_id}", response_model=StatusResponse, dependencies=[Depends(require_internal_api_key)])
async def status(file_id: str) -> StatusResponse:
    row = get_file_status(file_id)
    if not row:
        raise HTTPException(status_code=404, detail="file_not_found")
    return StatusResponse(
        fileId=row["file_id"],
        courseId=row["course_id"],
        fileName=row["file_name"],
        status=row["status"],
        versionStamp=row["version_stamp"],
        uploadDate=row["upload_date"].isoformat() if row["upload_date"] else None,
        processedAt=row["processed_at"].isoformat() if row["processed_at"] else None,
        error=row["error"],
        archived=row["archived"],
        chunkCount=row["chunk_count"],
    )


@app.post("/pipeline/retry/{file_id}", response_model=TaskResponse, dependencies=[Depends(require_internal_api_key)])
async def retry(file_id: str, request: RetryRequest) -> TaskResponse:
    row = fetch_library_file(file_id, request.course_id)
    if not row:
        raise HTTPException(status_code=404, detail="file_not_found")
    version_stamp = row.get("version_stamp") or new_version_stamp()
    mark_processing(file_id, row["course_id"], version_stamp)
    task = ingest_file_task.delay(file_id, row["course_id"], version_stamp)
    return TaskResponse(
        ok=True,
        fileId=file_id,
        courseId=row["course_id"],
        versionStamp=version_stamp,
        taskId=task.id,
        status="processing",
    )


@app.post("/pipeline/archive/{file_id}", dependencies=[Depends(require_internal_api_key)])
async def archive(file_id: str, request: ArchiveRequest) -> dict[str, bool]:
    try:
        archive_file(file_id, request.course_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {"ok": True}


@app.post("/internal/courses/{course_id}/ai/chat", response_model=InternalChatResponse, dependencies=[Depends(require_internal_api_key)])
async def internal_chat(course_id: str, request: InternalChatRequest) -> InternalChatResponse:
    if request.course_id != course_id:
        raise HTTPException(status_code=400, detail="course_id_mismatch")
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="message_required")
    result = answer_course_chat(
        student_id=request.student_id,
        course_id=course_id,
        message=request.message,
        conversation_history=request.conversation_history,
        top_k=request.top_k,
    )
    return InternalChatResponse(**result)


@app.post(
    "/internal/courses/{course_id}/quizzes/ai-generate",
    response_model=AiQuizGenerationResponse,
    dependencies=[Depends(require_internal_api_key)],
)
async def internal_ai_quiz_generate(course_id: str, request: AiQuizGenerationRequest) -> AiQuizGenerationResponse:
    if request.course_id != course_id:
        raise HTTPException(status_code=400, detail="course_id_mismatch")
    if not request.topic.strip():
        raise HTTPException(status_code=400, detail="topic_required")
    try:
        questions = generate_quiz_questions(
            course_id=course_id,
            topic=request.topic,
            question_count=request.question_count,
        )
    except QuizGenerationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return AiQuizGenerationResponse(questions=questions)


@app.get("/internal/courses/{course_id}/ai/query-logs", response_model=QueryLogsResponse, dependencies=[Depends(require_internal_api_key)])
async def internal_query_logs(
    course_id: str,
    studentId: str | None = None,
    startDate: str | None = None,
    endDate: str | None = None,
    page: int = 1,
    limit: int = 25,
) -> QueryLogsResponse:
    page = max(1, page)
    limit = max(1, min(limit, 100))
    result = list_ai_query_logs(
        course_id=course_id,
        student_id=studentId,
        start_date=startDate,
        end_date=endDate,
        page=page,
        limit=limit,
    )
    return QueryLogsResponse(
        items=[
            QueryLogItem(
                id=str(row["id"]),
                studentId=row["student_id"],
                courseId=row["course_id"],
                queryText=row["query_text"],
                aiResponse=row["ai_response"],
                sourceChunkIds=list(row["source_chunk_ids"] or []),
                lockModeActive=row["lock_mode_active"],
                createdAt=row["created_at"].isoformat(),
            )
            for row in result["items"]
        ],
        total=result["total"],
        page=page,
        limit=limit,
    )
