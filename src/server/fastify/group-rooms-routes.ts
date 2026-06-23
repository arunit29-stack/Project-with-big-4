/**
 * Group Rooms Routes
 * REST endpoints for CRUD operations, task board, and contribution metrics
 */
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../lib/server/auth/fastify";
import { getCourseDetail } from "../../lib/api/courseStore";
import {
  createGroupRoom,
  getCourseRooms,
  getGroupRoom,
  getRoomMembers,
  isRoomMember,
  updateRoomMembers,
  deleteGroupRoom,
} from "../../lib/server/group-rooms/room";
import {
  createTask,
  getTask,
  updateTask,
  getRoomKanban,
  getRoomTasks,
  deleteTask,
} from "../../lib/server/group-rooms/task";
import {
  getRoomContributionMetrics,
  getStudentMetrics,
} from "../../lib/server/group-rooms/contribution";
import {
  createInactivityReport,
  getRoomInactivityReports,
} from "../../lib/server/group-rooms/inactivity";
import type {
  CreateGroupRoomRequest,
  CreateTaskRequest,
  UpdateTaskRequest,
  UpdateMembersRequest,
  CreateInactivityReportRequest,
} from "../../types/group-rooms";

function teacherOwnsCourse(courseId: string): boolean {
  return Boolean(
    getCourseDetail(courseId, "teacher") || getCourseDetail(courseId, "admin")
  );
}

export async function registerGroupRoomsRoutes(app: FastifyInstance) {
  /**
   * GET /courses/:courseId/group-rooms
   * Get all rooms for course
   * - Teacher: sees all rooms with summaries
   * - Student: sees only their assigned rooms
   */
  app.get(
    "/courses/:courseId/group-rooms",
    { preHandler: requireAuth(["teacher", "student"]) },
    async (request, reply) => {
      const { courseId } = request.params as { courseId: string };

      try {
        const isTeacher = request.auth.role === "teacher";
        const rooms = await getCourseRooms(
          courseId,
          request.auth.userId,
          isTeacher
        );
        return reply.send({ rooms });
      } catch (err) {
        console.error("Error fetching rooms:", err);
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );

  /**
   * POST /courses/:courseId/group-rooms
   * Create a new group room
   * Teacher only, creates room and assigns members
   */
  app.post(
    "/courses/:courseId/group-rooms",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { courseId } = request.params as { courseId: string };

      if (!teacherOwnsCourse(courseId)) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const body = request.body as CreateGroupRoomRequest;

      if (!body.name || !Array.isArray(body.memberStudentIds)) {
        return reply.code(400).send({ error: "invalid_payload" });
      }

      try {
        const roomId = await createGroupRoom(
          courseId,
          request.auth.userId,
          body
        );
        return reply.send({ roomId });
      } catch (err) {
        console.error("Error creating room:", err);
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );

  /**
   * POST /group-rooms/:roomId/members
   * Add or remove room members
   * Teacher only
   */
  app.post(
    "/group-rooms/:roomId/members",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { roomId } = request.params as { roomId: string };

      try {
        const room = await getGroupRoom(roomId);
        if (!room) {
          return reply.code(404).send({ error: "room_not_found" });
        }

        if (!teacherOwnsCourse(room.courseId)) {
          return reply.code(403).send({ error: "forbidden" });
        }

        const body = request.body as UpdateMembersRequest;

        if (!body.action || !Array.isArray(body.studentIds)) {
          return reply.code(400).send({ error: "invalid_payload" });
        }

        await updateRoomMembers(roomId, body);
        return reply.send({ ok: true });
      } catch (err) {
        console.error("Error updating members:", err);
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );

  /**
   * GET /group-rooms/:roomId/tasks
   * Get all tasks grouped by status (Kanban board)
   */
  app.get(
    "/group-rooms/:roomId/tasks",
    { preHandler: requireAuth(["teacher", "student"]) },
    async (request, reply) => {
      const { roomId } = request.params as { roomId: string };

      try {
        // Check if user has access
        const isMember = await isRoomMember(roomId, request.auth.userId);
        const isTeacher = request.auth.role === "teacher";

        if (!isMember && !isTeacher) {
          return reply.code(403).send({ error: "forbidden" });
        }

        const kanban = await getRoomKanban(roomId);
        return reply.send(kanban);
      } catch (err) {
        console.error("Error fetching tasks:", err);
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );

  /**
   * POST /group-rooms/:roomId/tasks
   * Create a new task
   * Teacher or student (room member)
   */
  app.post(
    "/group-rooms/:roomId/tasks",
    { preHandler: requireAuth(["teacher", "student"]) },
    async (request, reply) => {
      const { roomId } = request.params as { roomId: string };

      try {
        // Check if user has access
        const isMember = await isRoomMember(roomId, request.auth.userId);
        const isTeacher = request.auth.role === "teacher";

        if (!isMember && !isTeacher) {
          return reply.code(403).send({ error: "forbidden" });
        }

        const body = request.body as CreateTaskRequest;

        if (!body.title) {
          return reply.code(400).send({ error: "title_required" });
        }

        const taskId = await createTask(roomId, request.auth.userId, body);
        return reply.send({ taskId });
      } catch (err) {
        console.error("Error creating task:", err);
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );

  /**
   * PATCH /group-rooms/:roomId/tasks/:taskId
   * Update task (status, assignment, etc.)
   * Any room member can move tasks
   */
  app.patch(
    "/group-rooms/:roomId/tasks/:taskId",
    { preHandler: requireAuth(["teacher", "student"]) },
    async (request, reply) => {
      const { roomId, taskId } = request.params as {
        roomId: string;
        taskId: string;
      };

      try {
        // Check if user has access
        const isMember = await isRoomMember(roomId, request.auth.userId);
        const isTeacher = request.auth.role === "teacher";

        if (!isMember && !isTeacher) {
          return reply.code(403).send({ error: "forbidden" });
        }

        const task = await getTask(taskId);
        if (!task) {
          return reply.code(404).send({ error: "task_not_found" });
        }

        const body = request.body as UpdateTaskRequest;
        await updateTask(taskId, request.auth.userId, body);
        return reply.send({ ok: true });
      } catch (err) {
        console.error("Error updating task:", err);
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );

  /**
   * GET /group-rooms/:roomId/contribution-metrics
   * Get contribution metrics for all students in room
   * Teacher only
   */
  app.get(
    "/group-rooms/:roomId/contribution-metrics",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { roomId } = request.params as { roomId: string };

      try {
        const room = await getGroupRoom(roomId);
        if (!room) {
          return reply.code(404).send({ error: "room_not_found" });
        }

        if (!teacherOwnsCourse(room.courseId)) {
          return reply.code(403).send({ error: "forbidden" });
        }

        const metrics = await getRoomContributionMetrics(roomId);
        return reply.send(metrics);
      } catch (err) {
        console.error("Error fetching metrics:", err);
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );

  /**
   * POST /group-rooms/:roomId/inactivity-report
   * Student reports inactive peer
   * Student only
   */
  app.post(
    "/group-rooms/:roomId/inactivity-report",
    { preHandler: requireAuth(["student"]) },
    async (request, reply) => {
      const { roomId } = request.params as { roomId: string };

      try {
        // Check if reporter is member
        const isMember = await isRoomMember(roomId, request.auth.userId);
        if (!isMember) {
          return reply.code(403).send({ error: "forbidden" });
        }

        const room = await getGroupRoom(roomId);
        if (!room) {
          return reply.code(404).send({ error: "room_not_found" });
        }

        const body = request.body as CreateInactivityReportRequest;

        if (!body.reportedStudentId || !body.reason) {
          return reply.code(400).send({ error: "invalid_payload" });
        }

        // Check that reported student is also member
        const reportedIsMember = await isRoomMember(
          roomId,
          body.reportedStudentId
        );
        if (!reportedIsMember) {
          return reply.code(400).send({
            error: "reported_student_not_in_room",
          });
        }

        const reportId = await createInactivityReport(
          roomId,
          request.auth.userId,
          body.reportedStudentId,
          body.reason
        );

        // TODO: Notify teacher immediately
        // notifyUser(teacherId, "group_inactivity_report", {
        //   reportedStudentName: body.reportedStudentId,
        //   roomName: room.name,
        //   reason: body.reason,
        // });

        return reply.send({ reportId });
      } catch (err) {
        console.error("Error creating inactivity report:", err);
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );
}
