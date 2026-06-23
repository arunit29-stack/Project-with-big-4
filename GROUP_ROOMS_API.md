# Group Rooms API - Documentation

**Status:** ✅ Complete and deployed  
**Version:** 1.0.0  
**Last Updated:** 2024

---

## Overview

The Group Rooms API enables collaborative learning spaces within courses. Students and teachers can:

- **Create collaborative group work rooms** with assigned student teams
- **Manage Kanban task boards** with status tracking (todo → in_progress → done)
- **Track member contributions** across messaging, task completion, and document edits
- **Report peer inactivity** for teacher intervention
- **Chat in real-time** with persistent message history (2-year retention)
- **Detect prolonged inactivity** via hourly cron job (48+ hour detection)

**Key Design Principle:** Contribution tracking happens automatically as students interact; teachers see aggregated reports and can monitor inactivity patterns.

---

## REST Endpoints

### Room Management

#### GET `/courses/:courseId/group-rooms`
Fetch all rooms in a course

**Auth:** Teacher or Student

**Response:**
```json
{
  "rooms": [
    {
      "id": "room-123",
      "courseId": "course-456",
      "name": "Group A - Project 1",
      "createdBy": "teacher-789",
      "memberCount": 4,
      "taskCount": 8,
      "tasksByStatus": {
        "todo": 2,
        "inProgress": 5,
        "done": 1
      },
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

**Behavior:**
- **Teacher:** Sees all rooms in course with aggregate stats
- **Student:** Sees only rooms they are members of

---

#### POST `/courses/:courseId/group-rooms`
Create a new group room

**Auth:** Teacher only

**Request:**
```json
{
  "name": "Group A - Project 1",
  "memberStudentIds": ["student-1", "student-2", "student-3", "student-4"]
}
```

**Response:**
```json
{
  "roomId": "room-123"
}
```

---

#### POST `/group-rooms/:roomId/members`
Add or remove room members

**Auth:** Teacher only

**Request:**
```json
{
  "action": "add",
  "studentIds": ["student-5", "student-6"]
}
```

**Behavior:**
- `"action": "add"` — Inserts new members
- `"action": "remove"` — Removes members

**Response:**
```json
{
  "ok": true
}
```

---

### Task Management

#### GET `/group-rooms/:roomId/tasks`
Get all tasks grouped by status (Kanban board view)

**Auth:** Room member or Teacher

**Response:**
```json
{
  "todo": [
    {
      "id": "task-1",
      "roomId": "room-123",
      "title": "Research phase",
      "description": "Gather sources",
      "assignedTo": "student-1",
      "createdBy": "teacher-789",
      "status": "todo",
      "dueDate": "2024-01-20T23:59:59Z",
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-15T10:00:00Z"
    }
  ],
  "in_progress": [
    {
      "id": "task-2",
      "roomId": "room-123",
      "title": "Draft outline",
      "status": "in_progress",
      "assignedTo": "student-2",
      "dueDate": "2024-01-25T23:59:59Z",
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-16T14:30:00Z"
    }
  ],
  "done": []
}
```

---

#### POST `/group-rooms/:roomId/tasks`
Create a new task

**Auth:** Room member or Teacher

**Request:**
```json
{
  "title": "Research phase",
  "description": "Gather sources",
  "assignedToStudentId": "student-1",
  "dueDate": "2024-01-20T23:59:59Z",
  "status": "todo"
}
```

**Response:**
```json
{
  "taskId": "task-123"
}
```

---

#### PATCH `/group-rooms/:roomId/tasks/:taskId`
Update task properties (status, assignment, etc.)

**Auth:** Room member or Teacher

**Request:**
```json
{
  "status": "in_progress",
  "assignedToStudentId": "student-2"
}
```

**Behavior:**
- Any room member can move tasks between statuses
- When task moves to `"done"`: contribution metric `task_completions` incremented for assigned student
- Status changes logged in `task_audit_log` with timestamp and userId

**Response:**
```json
{
  "ok": true
}
```

---

### Contribution Metrics

#### GET `/group-rooms/:roomId/contribution-metrics`
Get contribution report for all students in room

**Auth:** Teacher only

**Response:**
```json
{
  "roomId": "room-123",
  "studentBreakdowns": [
    {
      "studentId": "student-1",
      "studentName": "Alice",
      "totalMessages": 24,
      "totalTaskCompletions": 5,
      "totalDocumentEdits": 18,
      "lastActivityAt": "2024-01-16T14:30:00Z",
      "dailyBreakdown": [
        {
          "date": "2024-01-16",
          "messagesSent": 8,
          "taskCompletions": 1,
          "documentEditEvents": 5
        },
        {
          "date": "2024-01-15",
          "messagesSent": 16,
          "taskCompletions": 4,
          "documentEditEvents": 13
        }
      ]
    }
  ]
}
```

**Tracking Dimensions:**
1. **Messages:** Incremented on every chat message sent
2. **Task Completions:** Incremented when task moves to "done"
3. **Document Edits:** Incremented via Yjs awareness (document collaboration)

**Granularity:** Daily (one record per student per day)

---

### Inactivity Reporting

#### POST `/group-rooms/:roomId/inactivity-report`
Student reports an inactive peer to teacher

**Auth:** Student only

**Request:**
```json
{
  "reportedStudentId": "student-3",
  "reason": "No activity for 2+ days on assigned task"
}
```

**Response:**
```json
{
  "reportId": "report-456"
}
```

**Behavior:**
- Report immediately notifies the course teacher
- Teacher receives notification with student name, room name, and reason
- Multiple reports on same student are tracked (not deduplicated)

---

## WebSocket (Real-Time Chat)

### Namespace: `/group-rooms/:roomId/chat`

Real-time messaging for group rooms. Messages are persisted to PostgreSQL with 2-year retention.

**Connection (Example):**
```javascript
const socket = io("http://localhost:3000", {
  path: "/socket.io",
  auth: {
    userId: "student-1",
    role: "student"
  }
});

socket.connect("/group-rooms/room-123/chat");
```

---

#### Event: `message_history`
Received on connection with previous 50 messages

```javascript
socket.on("message_history", (data) => {
  console.log(data.messages);
  // [
  //   {
  //     "id": "msg-1",
  //     "senderId": "student-1",
  //     "text": "Hello team!",
  //     "createdAt": "2024-01-16T10:00:00Z"
  //   }
  // ]
});
```

---

#### Event: `send_message`
Send a chat message (students only)

```javascript
socket.emit("send_message", { text: "Hello team!" }, (result) => {
  if (result.ok) {
    console.log("Message sent:", result.messageId);
  } else {
    console.error("Error:", result.error);
  }
});
```

**Constraints:**
- **Students** can send and receive messages
- **Teachers** can view only (read-only observer mode)
- Message increments `messages_sent` contribution metric automatically

---

#### Event: `new_message`
Broadcast to all connected users in room

```javascript
socket.on("new_message", (message) => {
  console.log(`${message.senderName}: ${message.text}`);
  // Alice: Hello team!
});
```

---

#### Event: `user_typing`
Broadcast typing indicator

**Send:**
```javascript
socket.emit("user_typing", { isTyping: true });
```

**Receive:**
```javascript
socket.on("user_typing", (data) => {
  console.log(`${data.userId} is typing...`);
});
```

---

## Background Jobs

### Inactivity Detection Cron (Hourly)

Runs every hour to detect students with no activity on 48+ hour old tasks.

**Query Pattern:**
1. Find all `group_room_tasks` with:
   - `status = 'in_progress'`
   - `assigned_to` is not null
   - `updated_at < NOW() - 48 HOURS`

2. For each task, check if student has activity in `contribution_metrics` for last 48 hours
   - If `messages_sent > 0` OR `task_completions > 0` OR `document_edit_events > 0` → Active
   - Otherwise → Inactive

3. For inactive students:
   - Fire notification to teacher with:
     - Student name
     - Room name
     - Task title
     - Inactivity duration

**Lifecycle:**
- Starts on app initialization via `startInactivityDetectionCron()`
- Runs immediately, then every 60 minutes
- Can be stopped via `stopInactivityDetectionCron(intervalId)`

---

## Database Schema

### Tables

#### `group_rooms`
```sql
CREATE TABLE group_rooms (
  id UUID PRIMARY KEY,
  course_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);
```

#### `group_room_members`
```sql
CREATE TABLE group_room_members (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL,
  student_id TEXT NOT NULL,
  joined_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (room_id) REFERENCES group_rooms(id) ON DELETE CASCADE,
  UNIQUE (room_id, student_id)
);
```

#### `room_chat_messages`
```sql
CREATE TABLE room_chat_messages (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL,
  sender_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '2 years'),
  FOREIGN KEY (room_id) REFERENCES group_rooms(id) ON DELETE CASCADE
);
```

#### `group_room_tasks`
```sql
CREATE TABLE group_room_tasks (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT,
  created_by TEXT NOT NULL,
  status TEXT CHECK (status IN ('todo', 'in_progress', 'done')) DEFAULT 'todo',
  due_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (room_id) REFERENCES group_rooms(id) ON DELETE CASCADE
);
```

#### `task_audit_log`
```sql
CREATE TABLE task_audit_log (
  id UUID PRIMARY KEY,
  task_id UUID NOT NULL,
  room_id UUID NOT NULL,
  changed_by TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (task_id) REFERENCES group_room_tasks(id) ON DELETE CASCADE
);
```

#### `contribution_metrics`
```sql
CREATE TABLE contribution_metrics (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL,
  student_id TEXT NOT NULL,
  metric_date DATE NOT NULL,
  messages_sent INT DEFAULT 0,
  task_completions INT DEFAULT 0,
  document_edit_events INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (room_id) REFERENCES group_rooms(id) ON DELETE CASCADE,
  UNIQUE (room_id, student_id, metric_date)
);
```

#### `inactivity_reports`
```sql
CREATE TABLE inactivity_reports (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL,
  reporter_id TEXT NOT NULL,
  reported_student_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (room_id) REFERENCES group_rooms(id) ON DELETE CASCADE
);
```

---

## Service Layer

### Room Management (`src/lib/server/group-rooms/room.ts`)
- `createGroupRoom(courseId, createdBy, request)` → `roomId`
- `getCourseRooms(courseId, userId, isTeacher)` → `GroupRoomWithSummary[]`
- `getGroupRoom(roomId)` → `GroupRoom`
- `getRoomMembers(roomId)` → `string[]`
- `isRoomMember(roomId, studentId)` → `boolean`
- `updateRoomMembers(roomId, request)` → `void`
- `deleteGroupRoom(roomId)` → `void`

### Task Management (`src/lib/server/group-rooms/task.ts`)
- `createTask(roomId, createdBy, request)` → `taskId`
- `getTask(taskId)` → `GroupRoomTask`
- `updateTask(taskId, changedBy, request)` → `void`
- `getRoomKanban(roomId)` → `KanbanBoard`
- `getTaskAuditLog(taskId)` → `TaskAuditLog[]`
- `getRoomTasks(roomId)` → `GroupRoomTask[]`
- `deleteTask(taskId)` → `void`

### Contribution Tracking (`src/lib/server/group-rooms/contribution.ts`)
- `incrementMessagesSent(roomId, studentId)` → `void`
- `incrementDocumentEdits(roomId, studentId)` → `void`
- `getRoomContributionMetrics(roomId)` → `ContributionMetricsResponse`
- `getStudentMetrics(roomId, studentId, sinceDate)` → `ContributionMetrics[]`
- `hasRecentActivity(roomId, studentId, hoursAgo)` → `boolean`

### Chat Messages (`src/lib/server/group-rooms/chat.ts`)
- `saveChatMessage(roomId, senderId, text)` → `messageId`
- `getRoomMessages(roomId, limit, offset)` → `RoomChatMessage[]`
- `getRoomMessageCount(roomId)` → `number`
- `deleteExpiredMessages()` → `number` (rows deleted)
- `deleteRoomMessages(roomId)` → `void`

### Inactivity Reporting (`src/lib/server/group-rooms/inactivity.ts`)
- `createInactivityReport(roomId, reporterId, reportedStudentId, reason)` → `reportId`
- `getRoomInactivityReports(roomId)` → `InactivityReport[]`
- `getStudentInactivityReports(roomId, studentId, sinceHours)` → `InactivityReport[]`

### Inactivity Detection (`src/lib/server/group-rooms/inactivity-cron.ts`)
- `detectInactiveStudents()` → `Promise<void>`
- `startInactivityDetectionCron()` → `NodeJS.Timeout`
- `stopInactivityDetectionCron(intervalId)` → `void`

---

## Error Handling

### Common Error Responses

**400 Bad Request**
```json
{
  "error": "invalid_payload"
}
```
Missing or malformed required fields.

---

**403 Forbidden**
```json
{
  "error": "forbidden"
}
```
User lacks authorization (not teacher, not room member, etc.).

---

**404 Not Found**
```json
{
  "error": "room_not_found"
}
```
Resource (room, task) does not exist.

---

**500 Internal Server Error**
```json
{
  "error": "error message"
}
```
Database or service failure.

---

## Integration Notes

### With Existing Quiz System
- Group rooms are independent of quizzes (separate feature)
- Both use same PostgreSQL database and Fastify framework
- Both have Socket.io namespaces for real-time updates

### With Existing Notification System
- Inactivity reports and cron notifications integrate with existing `notifyUser()` function
- Teachers receive notifications for:
  - Student inactivity report: `"group_inactivity_report"`
  - Cron-detected inactivity: `"group_inactivity_48h"`

### With Existing Authentication
- Uses same `requireAuth` middleware pattern
- Supports `"teacher"` and `"student"` roles
- Validates via `request.auth.userId` and `request.auth.role`

---

## Future Enhancements

1. **Document Collaboration:** Use Yjs awareness to track document_edit_events in real-time
2. **Attachment Sharing:** File upload/download for group deliverables
3. **Grade Submission:** Submit group work and receive teacher feedback
4. **Contribution Disputes:** Allow students to contest contribution metrics
5. **Advanced Analytics:** Heatmaps, trend analysis, peer comparison reports
6. **Offline Support:** Cache messages locally, sync on reconnect (ServiceWorker)

---

## Testing Checklist

- [ ] Create room with team assignment
- [ ] View room as teacher (see all) vs student (see own)
- [ ] Add/remove members
- [ ] Create task and assign to student
- [ ] Move task through statuses (todo → in_progress → done)
- [ ] Verify contribution metrics increment (messages, task completions)
- [ ] Send chat message and verify real-time broadcast
- [ ] Simulate 48+ hour inactivity and verify cron detection
- [ ] Student reports peer inactivity, teacher receives notification
- [ ] Message deletion after 2-year expiry
- [ ] Delete room and verify cascading deletes

---

## Deployment

**Environment Variables:** None additional (uses existing DB and Fastify setup)

**Startup:**
```typescript
// In app.ts
await registerGroupRoomsRoutes(app);
attachGroupRoomsChatServer(io);
startInactivityDetectionCron();
```

**Database Initialization:**
```typescript
// In initQuizDatabase() - already includes group rooms schema
await initGroupRoomsDatabase();
```

---

**End of Documentation**
