"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStudentCourses = getStudentCourses;
exports.getTeacherCourses = getTeacherCourses;
exports.findStudentCourseByCode = findStudentCourseByCode;
exports.createTeacherCourse = createTeacherCourse;
exports.getCourseDetail = getCourseDetail;
exports.generateCourseCode = generateCourseCode;
const now = Date.now();
const day = 24 * 60 * 60 * 1000;
let studentCourses = [
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
let teacherCourses = [
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
const courseCatalog = [
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
function generateCourseCode() {
    const segment = () => Math.random().toString(36).slice(2, 6).toUpperCase();
    return `CBB-${segment()}-${segment()}`;
}
function getStudentCourses() {
    return [...studentCourses];
}
function getTeacherCourses() {
    return [...teacherCourses];
}
function findStudentCourseByCode(code) {
    const normalized = code.trim().toUpperCase();
    const teacherMatch = teacherCourses.find((c) => c.enrolmentOpen &&
        (c.code.toUpperCase() === normalized || c.id.toUpperCase() === normalized));
    if (!teacherMatch)
        return undefined;
    const existing = studentCourses.find((c) => c.id === teacherMatch.id);
    if (existing)
        return existing;
    const joined = {
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
function createTeacherCourse(input) {
    const course = {
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
    studentCourses = [
        {
            id: course.id,
            name: course.name,
            teacherName: "Course instructor",
            code: course.code,
            nextDeadline: null,
            recentContent: null,
        },
        ...studentCourses,
    ];
    courseCatalog.push({
        id: course.id,
        name: course.name,
        code: course.code,
        description: course.description,
        role: "teacher",
    });
    courseCatalog.push({
        id: course.id,
        name: course.name,
        code: course.code,
        description: course.description,
        role: "student",
    });
    return course;
}
function getCourseDetail(courseId, role) {
    const resolvedRole = role === "admin" ? "teacher" : role;
    return courseCatalog.find((c) => c.id === courseId && c.role === resolvedRole);
}
