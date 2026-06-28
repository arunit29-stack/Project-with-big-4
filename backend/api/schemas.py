from pydantic import BaseModel, Field


class IngestRequest(BaseModel):
    course_id: str = Field(alias="courseId")
    file_id: str = Field(alias="fileId")


class RetryRequest(BaseModel):
    course_id: str | None = Field(default=None, alias="courseId")


class ArchiveRequest(BaseModel):
    course_id: str | None = Field(default=None, alias="courseId")


class TaskResponse(BaseModel):
    ok: bool
    file_id: str = Field(alias="fileId")
    course_id: str = Field(alias="courseId")
    version_stamp: str = Field(alias="versionStamp")
    task_id: str = Field(alias="taskId")
    status: str


class StatusResponse(BaseModel):
    file_id: str = Field(alias="fileId")
    course_id: str = Field(alias="courseId")
    file_name: str = Field(alias="fileName")
    status: str
    version_stamp: str | None = Field(alias="versionStamp")
    upload_date: str | None = Field(alias="uploadDate")
    processed_at: str | None = Field(alias="processedAt")
    error: str | None
    archived: bool
    chunk_count: int = Field(alias="chunkCount")


class ChatMessage(BaseModel):
    role: str
    content: str


class InternalChatRequest(BaseModel):
    student_id: str = Field(alias="studentId")
    course_id: str = Field(alias="courseId")
    message: str
    conversation_history: list[ChatMessage] = Field(default_factory=list, alias="conversationHistory")
    top_k: int = Field(default=6, alias="topK")


class Source(BaseModel):
    file_name: str = Field(alias="fileName")
    upload_date: str = Field(alias="uploadDate")
    page_number: int | None = Field(alias="pageNumber")


class InternalChatResponse(BaseModel):
    response: str
    sources: list[Source]
    lock_mode_active: bool = Field(alias="lockModeActive")


class QueryLogItem(BaseModel):
    id: str
    student_id: str = Field(alias="studentId")
    course_id: str = Field(alias="courseId")
    query_text: str = Field(alias="queryText")
    ai_response: str = Field(alias="aiResponse")
    source_chunk_ids: list[str] = Field(alias="sourceChunkIds")
    lock_mode_active: bool = Field(alias="lockModeActive")
    created_at: str = Field(alias="createdAt")


class QueryLogsResponse(BaseModel):
    items: list[QueryLogItem]
    total: int
    page: int
    limit: int


class AiQuizGenerationRequest(BaseModel):
    course_id: str = Field(alias="courseId")
    topic: str
    question_count: int = Field(default=10, alias="questionCount")


class AiGeneratedQuestion(BaseModel):
    question_text: str = Field(alias="questionText")
    options: list[str]
    correct_option_index: int = Field(alias="correctOptionIndex")
    difficulty_rating: str = Field(alias="difficultyRating")
    explanation: str
    point_value: int = Field(alias="pointValue")
    time_limit_seconds: int = Field(alias="timeLimitSeconds")


class AiQuizGenerationResponse(BaseModel):
    questions: list[AiGeneratedQuestion]
