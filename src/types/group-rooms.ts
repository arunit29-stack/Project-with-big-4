/**
 * Group Rooms Types - Kanban boards, collaboration, contribution tracking
 */

/**
 * Group Room (Collaboration space)
 */
export interface GroupRoom {
  id: string;
  courseId: string;
  name: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  teacherCanView: boolean; // Always true - metadata to show in room
}

/**
 * Room with contribution summary for teacher view
 */
export interface GroupRoomWithSummary extends GroupRoom {
  memberCount: number;
  taskCount: number;
  tasksByStatus: {
    todo: number;
    inProgress: number;
    done: number;
  };
}

/**
 * Room member
 */
export interface GroupRoomMember {
  id: string;
  roomId: string;
  studentId: string;
  joinedAt: string;
}

/**
 * Create room request
 */
export interface CreateGroupRoomRequest {
  name: string;
  memberStudentIds: string[];
}

/**
 * Chat message (stored in PostgreSQL)
 */
export interface RoomChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  text: string;
  createdAt: string;
  expiresAt: string; // 2-year retention
}

/**
 * Chat message request
 */
export interface SendChatMessageRequest {
  text: string;
}

/**
 * Task on task board (Kanban)
 */
export interface GroupRoomTask {
  id: string;
  roomId: string;
  title: string;
  description: string | null;
  assignedTo: string | null;
  createdBy: string;
  status: TaskStatus;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Task status (column)
 */
export type TaskStatus = "todo" | "in_progress" | "done";

/**
 * Create task request
 */
export interface CreateTaskRequest {
  title: string;
  description?: string;
  assignedToStudentId?: string;
  dueDate?: string; // ISO 8601
  status?: TaskStatus; // Default 'todo'
}

/**
 * Update task request
 */
export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  assignedToStudentId?: string;
  dueDate?: string;
  status?: TaskStatus;
}

/**
 * Task audit log entry
 */
export interface TaskAuditLog {
  id: string;
  taskId: string;
  roomId: string;
  changedBy: string;
  oldStatus: TaskStatus | null;
  newStatus: TaskStatus;
  changedAt: string;
}

/**
 * Tasks grouped by status (Kanban view)
 */
export interface KanbanBoard {
  todo: GroupRoomTask[];
  in_progress: GroupRoomTask[];
  done: GroupRoomTask[];
}

/**
 * Contribution metrics for a student per day
 */
export interface ContributionMetrics {
  id: string;
  roomId: string;
  studentId: string;
  metricDate: string; // YYYY-MM-DD
  messagesSent: number;
  taskCompletions: number;
  documentEditEvents: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Daily contribution data point
 */
export interface DailyContribution {
  date: string; // YYYY-MM-DD
  messagesSent: number;
  taskCompletions: number;
  documentEditEvents: number;
}

/**
 * Per-student contribution breakdown (for teacher report)
 */
export interface StudentContributionBreakdown {
  studentId: string;
  studentName: string;
  totalMessages: number;
  totalTaskCompletions: number;
  totalDocumentEdits: number;
  dailyBreakdown: DailyContribution[];
  lastActivityAt: string;
}

/**
 * Contribution metrics response for teacher
 */
export interface ContributionMetricsResponse {
  roomId: string;
  studentBreakdowns: StudentContributionBreakdown[];
}

/**
 * Inactivity report (student reports inactive peer)
 */
export interface InactivityReport {
  id: string;
  roomId: string;
  reporterId: string;
  reportedStudentId: string;
  reason: string;
  createdAt: string;
}

/**
 * Create inactivity report request
 */
export interface CreateInactivityReportRequest {
  reportedStudentId: string;
  reason: string;
}

/**
 * Members add/remove request
 */
export interface UpdateMembersRequest {
  action: "add" | "remove";
  studentIds: string[];
}

/**
 * Socket.io chat message event
 */
export interface ChatMessageEvent {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
}

/**
 * Inactivity detection (internal, not returned)
 */
export interface InactiveTask {
  taskId: string;
  roomId: string;
  assignedTo: string;
  taskTitle: string;
  roomName: string;
  updatedAt: string;
}

/**
 * Notification payload for inactivity
 */
export interface InactivityNotificationPayload {
  studentName: string;
  roomName: string;
  taskTitle: string;
}
