import type { CourseDetail, StudentCourse, TeacherCourse } from "@/types/course";

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

let studentCourses: StudentCourse[] = [
  {
    id: "course-bio-101",
    name: "Biology 101",
    teacherName: "Dr. Rivera",
    code: "BIO-101-A",
    nextDeadline: {
      title: "Cell structure lab report",
      dueAt: new Date(now + 3 * day).toISOString(),
    },
    recentContent: null,
  },
  {
    id: "course-chem-201",
    name: "Chemistry 201",
    teacherName: "Prof. Chen",
    code: "CHEM-201-B",
    nextDeadline: null,
    recentContent: {
      title: "Periodic table reference sheet",
      addedAt: new Date(now - 2 * day).toISOString(),
    },
  },
];

let teacherCourses: TeacherCourse[] = [
  {
    id: "course-bio-101",
    name: "Biology 101",
    code: "BIO-101-A",
    description: "Introductory biology for first-year students.",
    enrolmentOpen: true,
    studentCount: 28,
    pendingSubmissions: 5,
    hasUpcomingQuiz: true,
  },
  {
    id: "course-phys-110",
    name: "Physics 110",
    code: "PHYS-110-C",
    description: "Mechanics and motion fundamentals.",
    enrolmentOpen: false,
    studentCount: 19,
    pendingSubmissions: 0,
    hasUpcomingQuiz: false,
  },
];

const courseCatalog: CourseDetail[] = [
  {
    id: "course-bio-101",
    name: "Biology 101",
    code: "BIO-101-A",
    description: "Introductory biology for first-year students.",
    role: "student",
  },
  {
    id: "course-chem-201",
    name: "Chemistry 201",
    code: "CHEM-201-B",
    description: "Advanced chemistry topics.",
    role: "student",
  },
  {
    id: "course-bio-101",
    name: "Biology 101",
    code: "BIO-101-A",
    description: "Introductory biology for first-year students.",
    role: "teacher",
  },
  {
    id: "course-phys-110",
    name: "Physics 110",
    code: "PHYS-110-C",
    description: "Mechanics and motion fundamentals.",
    role: "teacher",
  },
];

function generateCourseCode(): string {
  const segment = () =>
    Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CBB-${segment()}-${segment()}`;
}

export function getStudentCourses(): StudentCourse[] {
  return [...studentCourses];
}

export function getTeacherCourses(): TeacherCourse[] {
  return [...teacherCourses];
}

export function findStudentCourseByCode(
  code: string,
): StudentCourse | undefined {
  const normalized = code.trim().toUpperCase();
  const teacherMatch = teacherCourses.find(
    (c) => c.code.toUpperCase() === normalized && c.enrolmentOpen,
  );
  if (!teacherMatch) return undefined;

  const existing = studentCourses.find((c) => c.id === teacherMatch.id);
  if (existing) return existing;

  const joined: StudentCourse = {
    id: teacherMatch.id,
    name: teacherMatch.name,
    teacherName: "Course instructor",
    code: teacherMatch.code,
    nextDeadline: null,
    recentContent: {
      title: "Welcome to the course",
      addedAt: new Date().toISOString(),
    },
  };
  studentCourses = [...studentCourses, joined];
  if (!courseCatalog.some((c) => c.id === joined.id && c.role === "student")) {
    courseCatalog.push({
      id: joined.id,
      name: joined.name,
      code: joined.code,
      description: teacherMatch.description,
      role: "student",
    });
  }
  return joined;
}

export function createTeacherCourse(input: {
  name: string;
  code: string;
  description: string;
  enrolmentOpen: boolean;
}): TeacherCourse {
  const course: TeacherCourse = {
    id: `course-${Date.now()}`,
    name: input.name,
    code: input.code,
    description: input.description,
    enrolmentOpen: input.enrolmentOpen,
    studentCount: 0,
    pendingSubmissions: 0,
    hasUpcomingQuiz: false,
  };
  teacherCourses = [course, ...teacherCourses];
  courseCatalog.push({
    id: course.id,
    name: course.name,
    code: course.code,
    description: course.description,
    role: "teacher",
  });
  return course;
}

export function getCourseDetail(
  courseId: string,
  role: "student" | "teacher" | "admin",
): CourseDetail | undefined {
  const resolvedRole = role === "admin" ? "teacher" : role;
  return courseCatalog.find((c) => c.id === courseId && c.role === resolvedRole);
}

export { generateCourseCode };
