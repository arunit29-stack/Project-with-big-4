import type {
  ContentLibraryResponse,
  ContentStatus,
  LibraryItem,
  LibraryWeek,
} from "@/types/content";

const STUDENT_VISIBLE: ContentStatus[] = ["ready"];

export function isVisibleToStudent(item: LibraryItem): boolean {
  return STUDENT_VISIBLE.includes(item.status);
}

export function filterLibraryForStudent(
  library: ContentLibraryResponse,
): ContentLibraryResponse {
  const weeks: LibraryWeek[] = library.weeks
    .map((week) => ({
      ...week,
      topics: week.topics
        .map((topic) => ({
          ...topic,
          items: topic.items.filter(isVisibleToStudent),
        }))
        .filter((topic) => topic.items.length > 0),
    }))
    .filter((week) => week.topics.length > 0);

  return { weeks };
}
