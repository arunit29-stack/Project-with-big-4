import json
from typing import Any

from anthropic import Anthropic
from pydantic import ValidationError

from app.api.schemas import AiGeneratedQuestion
from app.core.config import get_settings
from app.ingestion.embeddings import get_embedding_provider
from app.services.vector_store import get_vector_store

QUIZ_MODEL = "claude-sonnet-4-20250514"
QUIZ_CONTEXT_TOP_K = 15


class QuizGenerationError(ValueError):
    pass


def generate_quiz_questions(*, course_id: str, topic: str, question_count: int) -> list[dict[str, Any]]:
    count = max(1, min(int(question_count or 10), 30))
    topic = topic.strip()
    if not topic:
        raise QuizGenerationError("topic_required")

    query_embedding = get_embedding_provider().embed_query(topic)
    matches = get_vector_store().query_course(course_id, query_embedding, QUIZ_CONTEXT_TOP_K)
    normalized = [_normalize_match(match) for match in matches]
    normalized = [
        item
        for item in normalized
        if item["metadata"].get("courseId") == course_id and item["metadata"].get("archived") is False
    ]
    if not normalized:
        raise QuizGenerationError("no_course_context_found")

    context = _assemble_context(normalized)
    first_prompt = _system_prompt(count, strict_retry=False)
    retry_prompt = _system_prompt(count, strict_retry=True)

    for prompt in (first_prompt, retry_prompt):
        raw = _call_claude(system_prompt=prompt, topic=topic, question_count=count, context=context)
        try:
            return _parse_questions(raw, count)
        except QuizGenerationError:
            continue

    raise QuizGenerationError("invalid_model_json")


def _call_claude(*, system_prompt: str, topic: str, question_count: int, context: str) -> str:
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise ValueError("ANTHROPIC_API_KEY is required")

    client = Anthropic(api_key=settings.anthropic_api_key)
    result = client.messages.create(
        model=QUIZ_MODEL,
        max_tokens=4000,
        system=system_prompt,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Topic: {topic}\n"
                    f"Question count: {question_count}\n\n"
                    "Use only this retrieved course context:\n"
                    f"{context}"
                ),
            }
        ],
    )
    return "".join(block.text for block in result.content if getattr(block, "type", None) == "text").strip()


def _system_prompt(question_count: int, *, strict_retry: bool) -> str:
    base = (
        "You generate teacher-reviewed multiple-choice quiz drafts for Classroom But Better. "
        "Use ONLY the provided course context. "
        "Output ONLY a JSON array with no preamble, no markdown fences, and no extra text. "
        f"The array MUST contain exactly {question_count} question objects. "
        "Each object MUST have exactly these fields: "
        "questionText, options, correctOptionIndex, difficultyRating, explanation, pointValue, timeLimitSeconds. "
        "options MUST be an array of exactly 4 strings. "
        "correctOptionIndex MUST be an integer from 0 to 3. "
        "difficultyRating MUST be one of easy, medium, hard. "
        "pointValue MUST be 10. "
        "timeLimitSeconds MUST be 30. "
        "Do not include answers that are not grounded in the provided context."
    )
    if strict_retry:
        return (
            base
            + " Your previous response could not be parsed as valid JSON. "
            "Return a syntactically valid JSON array only. The first character must be [ and the last character must be ]."
        )
    return base


def _parse_questions(raw: str, question_count: int) -> list[dict[str, Any]]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as error:
        raise QuizGenerationError("json_parse_failed") from error

    if not isinstance(parsed, list) or len(parsed) != question_count:
        raise QuizGenerationError("wrong_question_count")

    validated: list[dict[str, Any]] = []
    for item in parsed:
        try:
            question = AiGeneratedQuestion(**item)
        except ValidationError as error:
            raise QuizGenerationError("invalid_question_shape") from error

        if len(question.options) != 4:
            raise QuizGenerationError("invalid_options_count")
        if question.correct_option_index < 0 or question.correct_option_index > 3:
            raise QuizGenerationError("invalid_correct_option")
        if question.difficulty_rating not in {"easy", "medium", "hard"}:
            raise QuizGenerationError("invalid_difficulty")
        if question.point_value != 10:
            raise QuizGenerationError("invalid_point_value")
        if question.time_limit_seconds != 30:
            raise QuizGenerationError("invalid_time_limit")

        validated.append(
            {
                "questionText": question.question_text.strip(),
                "options": [option.strip() for option in question.options],
                "correctOptionIndex": question.correct_option_index,
                "difficultyRating": question.difficulty_rating,
                "explanation": question.explanation.strip(),
                "pointValue": question.point_value,
                "timeLimitSeconds": question.time_limit_seconds,
            }
        )

    if any(not question["questionText"] or not all(question["options"]) for question in validated):
        raise QuizGenerationError("empty_question_text_or_option")

    return validated


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
                    f"pageNumber: {page_label}",
                    "text:",
                    str(metadata.get("text", "")),
                ]
            )
        )
    return "\n\n".join(blocks)


def _normalize_match(match: Any) -> dict[str, Any]:
    if isinstance(match, dict):
        return {"id": str(match.get("id")), "metadata": dict(match.get("metadata") or {})}
    return {"id": str(getattr(match, "id")), "metadata": dict(getattr(match, "metadata", {}) or {})}
