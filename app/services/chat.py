from typing import Any

from anthropic import Anthropic

from app.api.schemas import ChatMessage
from app.core.config import get_settings
from app.db.postgres import (
    get_course_name,
    insert_ai_query_log,
    is_assignment_lock_mode_active,
)
from app.ingestion.embeddings import get_embedding_provider
from app.services.vector_store import get_vector_store

GROUNDING_REFUSAL = "This topic is not covered in the course material. Please check with your teacher."
LOCK_MODE_APPENDIX = (
    "IMPORTANT: Assignment assessment mode is active. You MUST only provide concept-level hints, "
    "definitions, and clarifying explanations. You MUST NOT provide worked examples, direct answers, "
    "or step-by-step solutions. If a student asks for a direct answer, redirect them to the course "
    "concepts that apply."
)


def answer_course_chat(
    *,
    student_id: str,
    course_id: str,
    message: str,
    conversation_history: list[ChatMessage],
    top_k: int,
) -> dict[str, Any]:
    query_embedding = get_embedding_provider().embed_query(message)
    matches = get_vector_store().query_course(course_id, query_embedding, max(1, min(top_k, 12)))
    normalized = [_normalize_match(match) for match in matches]
    normalized = [item for item in normalized if item["metadata"].get("courseId") == course_id and item["metadata"].get("archived") is False]

    lock_mode_active = is_assignment_lock_mode_active(course_id)
    if not normalized:
        insert_ai_query_log(
            student_id=student_id,
            course_id=course_id,
            query_text=message,
            ai_response=GROUNDING_REFUSAL,
            source_chunk_ids=[],
            lock_mode_active=lock_mode_active,
        )
        return {"response": GROUNDING_REFUSAL, "sources": [], "lockModeActive": lock_mode_active}

    context = _assemble_context(normalized)
    source_chunk_ids = [item["id"] for item in normalized]
    sources = _sources(normalized)
    response = _call_claude(
        course_name=get_course_name(course_id),
        context=context,
        message=message,
        conversation_history=conversation_history,
        lock_mode_active=lock_mode_active,
    )
    if response != GROUNDING_REFUSAL and not _has_source_citation(response, sources):
        response = GROUNDING_REFUSAL

    insert_ai_query_log(
        student_id=student_id,
        course_id=course_id,
        query_text=message,
        ai_response=response,
        source_chunk_ids=source_chunk_ids,
        lock_mode_active=lock_mode_active,
    )
    return {"response": response, "sources": sources, "lockModeActive": lock_mode_active}


def _call_claude(
    *,
    course_name: str,
    context: str,
    message: str,
    conversation_history: list[ChatMessage],
    lock_mode_active: bool,
) -> str:
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise ValueError("ANTHROPIC_API_KEY is required")

    system_prompt = _system_prompt(course_name, context, lock_mode_active)
    messages = _trim_history(conversation_history)
    messages.append({"role": "user", "content": message})

    client = Anthropic(api_key=settings.anthropic_api_key)
    result = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1000,
        system=system_prompt,
        messages=messages,
    )
    return "".join(block.text for block in result.content if getattr(block, "type", None) == "text").strip()


def _system_prompt(course_name: str, context: str, lock_mode_active: bool) -> str:
    prompt = (
        f"You are a course-specific AI study assistant for {course_name}. "
        "You MUST answer ONLY using the provided course material context below. "
        "You MUST cite the source document name and page number for every factual claim. "
        f"If the answer cannot be found in the provided context, respond EXACTLY with: '{GROUNDING_REFUSAL}' "
        "Do NOT use general world knowledge. Do NOT speculate. Do NOT generate content not grounded in the retrieved context. "
        "Never acknowledge that you are a large language model or discuss your training. "
        "If retrieved chunks from different file versions contradict each other, your response must note: "
        "\"Note: I found potentially conflicting information across course materials — [FileName A] states X while [FileName B] states Y. "
        "Please check with your teacher for clarification.\"\n\n"
        f"Course material context:\n{context}"
    )
    if lock_mode_active:
        prompt += "\n\n" + LOCK_MODE_APPENDIX
    return prompt


def _trim_history(history: list[ChatMessage]) -> list[dict[str, str]]:
    safe: list[dict[str, str]] = []
    for item in history[-20:]:
        if item.role not in {"user", "assistant"}:
            continue
        if not item.content.strip():
            continue
        safe.append({"role": item.role, "content": item.content[:4000]})
    while safe and safe[0]["role"] != "user":
        safe.pop(0)
    return safe


def _assemble_context(matches: list[dict[str, Any]]) -> str:
    blocks: list[str] = []
    for index, item in enumerate(matches, start=1):
        metadata = item["metadata"]
        page = metadata.get("pageNumber")
        page_label = "N/A" if page is None else str(page)
        blocks.append(
            "\n".join(
                [
                    f"[Chunk {index}]",
                    f"chunkId: {item['id']}",
                    f"fileName: {metadata.get('fileName')}",
                    f"uploadDate: {metadata.get('uploadDate')}",
                    f"pageNumber: {page_label}",
                    f"versionStamp: {metadata.get('versionStamp')}",
                    "text:",
                    str(metadata.get("text", "")),
                ]
            )
        )
    return "\n\n".join(blocks)


def _sources(matches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, int | None]] = set()
    sources: list[dict[str, Any]] = []
    for item in matches:
        metadata = item["metadata"]
        source = (
            str(metadata.get("fileName") or ""),
            str(metadata.get("uploadDate") or ""),
            metadata.get("pageNumber"),
        )
        if source in seen:
            continue
        seen.add(source)
        sources.append(
            {
                "fileName": source[0],
                "uploadDate": source[1],
                "pageNumber": source[2],
            }
        )
    return sources


def _has_source_citation(response: str, sources: list[dict[str, Any]]) -> bool:
    return any(source["fileName"] and source["fileName"] in response for source in sources)


def _normalize_match(match: Any) -> dict[str, Any]:
    if isinstance(match, dict):
        return {"id": str(match.get("id")), "metadata": dict(match.get("metadata") or {})}
    return {"id": str(getattr(match, "id")), "metadata": dict(getattr(match, "metadata", {}) or {})}
