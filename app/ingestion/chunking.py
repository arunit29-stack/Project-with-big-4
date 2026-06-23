from dataclasses import dataclass
from typing import Any

from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.ingestion.extractors import ExtractedSection


@dataclass(frozen=True)
class Chunk:
    text: str
    metadata: dict[str, Any]


def build_chunks(
    sections: list[ExtractedSection],
    *,
    course_id: str,
    file_id: str,
    file_name: str,
    upload_date: str,
    version_stamp: str,
) -> list[Chunk]:
    splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
        model_name="gpt-4",
        chunk_size=800,
        chunk_overlap=150,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks: list[Chunk] = []
    chunk_index = 0
    for section in sections:
        for text in splitter.split_text(section.text):
            chunks.append(
                Chunk(
                    text=text,
                    metadata={
                        "courseId": course_id,
                        "fileId": file_id,
                        "fileName": file_name,
                        "uploadDate": upload_date,
                        "pageNumber": section.page_number,
                        "chunkIndex": chunk_index,
                        "versionStamp": version_stamp,
                        "archived": False,
                    },
                )
            )
            chunk_index += 1
    return chunks
