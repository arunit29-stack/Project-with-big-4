"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGroupRoomsRoutes = registerGroupRoomsRoutes;
const fastify_1 = require("../../lib/server/auth/fastify");
const courseStore_1 = require("../../lib/api/courseStore");
const room_1 = require("../../lib/server/group-rooms/room");
const task_1 = require("../../lib/server/group-rooms/task");
const contribution_1 = require("../../lib/server/group-rooms/contribution");
const inactivity_1 = require("../../lib/server/group-rooms/inactivity");
function teacherOwnsCourse(courseId) {
    return Boolean((0, courseStore_1.getCourseDetail)(courseId, "teacher") || (0, courseStore_1.getCourseDetail)(courseId, "admin"));
}
async function registerGroupRoomsRoutes(app) {
    /**
     * GET /courses/:courseId/group-rooms
     * Get all rooms for course
     * - Teacher: sees all rooms with summaries
     * - Student: sees only their assigned rooms
     */
    app.get("/courses/:courseId/group-rooms", { preHandler: (0, fastify_1.requireAuth)(["teacher", "student"]) }, async (request, reply) => {
        const { courseId } = request.params;
        try {
            const isTeacher = request.auth.role === "teacher";
            const rooms = await (0, room_1.getCourseRooms)(courseId, request.auth.userId, isTeacher);
            return reply.send({ rooms });
        }
        catch (err) {
            console.error("Error fetching rooms:", err);
            return reply.code(500).send({ error: err.message });
        }
    });
    /**
     * POST /courses/:courseId/group-rooms
     * Create a new group room
     * Teacher only, creates room and assigns members
     */
    app.post("/courses/:courseId/group-rooms", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { courseId } = request.params;
        if (!teacherOwnsCourse(courseId)) {
            return reply.code(403).send({ error: "forbidden" });
        }
        const body = request.body;
        if (!body.name || !Array.isArray(body.memberStudentIds)) {
            return reply.code(400).send({ error: "invalid_payload" });
        }
        try {
            const roomId = await (0, room_1.createGroupRoom)(courseId, request.auth.userId, body);
            return reply.send({ roomId });
        }
        catch (err) {
            console.error("Error creating room:", err);
            return reply.code(500).send({ error: err.message });
        }
    });
    /**
     * POST /group-rooms/:roomId/members
     * Add or remove room members
     * Teacher only
     */
    app.post("/group-rooms/:roomId/members", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { roomId } = request.params;
        try {
            const room = await (0, room_1.getGroupRoom)(roomId);
            if (!room) {
                return reply.code(404).send({ error: "room_not_found" });
            }
            if (!teacherOwnsCourse(room.courseId)) {
                return reply.code(403).send({ error: "forbidden" });
            }
            const body = request.body;
            if (!body.action || !Array.isArray(body.studentIds)) {
                return reply.code(400).send({ error: "invalid_payload" });
            }
            await (0, room_1.updateRoomMembers)(roomId, body);
            return reply.send({ ok: true });
        }
        catch (err) {
            console.error("Error updating members:", err);
            return reply.code(500).send({ error: err.message });
        }
    });
    /**
     * GET /group-rooms/:roomId/tasks
     * Get all tasks grouped by status (Kanban board)
     */
    app.get("/group-rooms/:roomId/tasks", { preHandler: (0, fastify_1.requireAuth)(["teacher", "student"]) }, async (request, reply) => {
        const { roomId } = request.params;
        try {
            // Check if user has access
            const isMember = await (0, room_1.isRoomMember)(roomId, request.auth.userId);
            const isTeacher = request.auth.role === "teacher";
            if (!isMember && !isTeacher) {
                return reply.code(403).send({ error: "forbidden" });
            }
            const kanban = await (0, task_1.getRoomKanban)(roomId);
            return reply.send(kanban);
        }
        catch (err) {
            console.error("Error fetching tasks:", err);
            return reply.code(500).send({ error: err.message });
        }
    });
    /**
     * POST /group-rooms/:roomId/tasks
     * Create a new task
     * Teacher or student (room member)
     */
    app.post("/group-rooms/:roomId/tasks", { preHandler: (0, fastify_1.requireAuth)(["teacher", "student"]) }, async (request, reply) => {
        const { roomId } = request.params;
        try {
            // Check if user has access
            const isMember = await (0, room_1.isRoomMember)(roomId, request.auth.userId);
            const isTeacher = request.auth.role === "teacher";
            if (!isMember && !isTeacher) {
                return reply.code(403).send({ error: "forbidden" });
            }
            const body = request.body;
            if (!body.title) {
                return reply.code(400).send({ error: "title_required" });
            }
            const taskId = await (0, task_1.createTask)(roomId, request.auth.userId, body);
            return reply.send({ taskId });
        }
        catch (err) {
            console.error("Error creating task:", err);
            return reply.code(500).send({ error: err.message });
        }
    });
    /**
     * PATCH /group-rooms/:roomId/tasks/:taskId
     * Update task (status, assignment, etc.)
     * Any room member can move tasks
     */
    app.patch("/group-rooms/:roomId/tasks/:taskId", { preHandler: (0, fastify_1.requireAuth)(["teacher", "student"]) }, async (request, reply) => {
        const { roomId, taskId } = request.params;
        try {
            // Check if user has access
            const isMember = await (0, room_1.isRoomMember)(roomId, request.auth.userId);
            const isTeacher = request.auth.role === "teacher";
            if (!isMember && !isTeacher) {
                return reply.code(403).send({ error: "forbidden" });
            }
            const task = await (0, task_1.getTask)(taskId);
            if (!task) {
                return reply.code(404).send({ error: "task_not_found" });
            }
            const body = request.body;
            await (0, task_1.updateTask)(taskId, request.auth.userId, body);
            return reply.send({ ok: true });
        }
        catch (err) {
            console.error("Error updating task:", err);
            return reply.code(500).send({ error: err.message });
        }
    });
    /**
     * GET /group-rooms/:roomId/contribution-metrics
     * Get contribution metrics for all students in room
     * Teacher only
     */
    app.get("/group-rooms/:roomId/contribution-metrics", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { roomId } = request.params;
        try {
            const room = await (0, room_1.getGroupRoom)(roomId);
            if (!room) {
                return reply.code(404).send({ error: "room_not_found" });
            }
            if (!teacherOwnsCourse(room.courseId)) {
                return reply.code(403).send({ error: "forbidden" });
            }
            const metrics = await (0, contribution_1.getRoomContributionMetrics)(roomId);
            return reply.send(metrics);
        }
        catch (err) {
            console.error("Error fetching metrics:", err);
            return reply.code(500).send({ error: err.message });
        }
    });
    /**
     * POST /group-rooms/:roomId/inactivity-report
     * Student reports inactive peer
     * Student only
     */
    app.post("/group-rooms/:roomId/inactivity-report", { preHandler: (0, fastify_1.requireAuth)(["student"]) }, async (request, reply) => {
        const { roomId } = request.params;
        try {
            // Check if reporter is member
            const isMember = await (0, room_1.isRoomMember)(roomId, request.auth.userId);
            if (!isMember) {
                return reply.code(403).send({ error: "forbidden" });
            }
            const room = await (0, room_1.getGroupRoom)(roomId);
            if (!room) {
                return reply.code(404).send({ error: "room_not_found" });
            }
            const body = request.body;
            if (!body.reportedStudentId || !body.reason) {
                return reply.code(400).send({ error: "invalid_payload" });
            }
            // Check that reported student is also member
            const reportedIsMember = await (0, room_1.isRoomMember)(roomId, body.reportedStudentId);
            if (!reportedIsMember) {
                return reply.code(400).send({
                    error: "reported_student_not_in_room",
                });
            }
            const reportId = await (0, inactivity_1.createInactivityReport)(roomId, request.auth.userId, body.reportedStudentId, body.reason);
            // TODO: Notify teacher immediately
            // notifyUser(teacherId, "group_inactivity_report", {
            //   reportedStudentName: body.reportedStudentId,
            //   roomName: room.name,
            //   reason: body.reason,
            // });
            return reply.send({ reportId });
        }
        catch (err) {
            console.error("Error creating inactivity report:", err);
            return reply.code(500).send({ error: err.message });
        }
    });
}
