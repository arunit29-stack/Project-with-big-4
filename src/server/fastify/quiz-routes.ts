/* eslint-disable */
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../lib/server/auth/fastify";
import { getCourseDetail, getStudentCourses } from "../../lib/api/courseStore";
import {
  createQuiz,
  getOrCreateAttempt,
  saveAnswer,
  voidQuestionAndRecalculate,
  voidQuestionAndRecalculateWithResponse,
  getQuizQuestions,
  createAiQuiz,
  editQuestion,
  deleteQuestion,
  addQuestion,
  publishQuiz,
} from "../../lib/server/quiz/service";
import {
  launchQuizLobby,
  extendQuizLobby,
  startQuiz,
} from "../../lib/server/quiz/coordinator";
import { getQuizState } from "../../lib/server/quiz/redis-state";
import type { AiQuizGenerationRequest, AiGeneratedQuestion, AddQuestionRequest } from "../../types/quiz";

function teacherOwnsCourse(courseId: string): boolean {
  return Boolean(getCourseDetail(courseId, "teacher") || getCourseDetail(courseId, "admin"));
}

function studentHasCourse(courseId: string): boolean {
  return getStudentCourses().some((course) => course.id === courseId);
}

export async function registerQuizRoutes(app: FastifyInstance): Promise<void> {
  // 1. Create Quiz (Teacher only)
  app.post(
    "/courses/:courseId/quizzes",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { courseId } = request.params as { courseId: string };
      if (!teacherOwnsCourse(courseId)) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const body = request.body as {
        title: string;
        questions: Array<{
          type: "mcq" | "true_false" | "short_answer";
          text: string;
          options?: string[];
          correctOptionIndex?: number;
          explanation?: string;
          pointValue?: number;
          timeLimitSeconds?: number;
        }>;
      };

      if (!body.title || !Array.isArray(body.questions) || body.questions.length === 0) {
        return reply.code(400).send({ error: "invalid_payload" });
      }

      try {
        const quizId = await createQuiz(courseId, body);
        return reply.send({ quizId });
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    }
  );

  // 2. Launch Lobby (Teacher only)
  app.post(
    "/quizzes/:quizId/launch",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { quizId } = request.params as { quizId: string };
      try {
        const lobbyEndsAt = await launchQuizLobby(quizId);
        return reply.send({ status: "lobby", lobbyEndsAt });
      } catch (err) {
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );

  // 3. Extend Lobby (Teacher only)
  app.post(
    "/quizzes/:quizId/lobby/extend",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { quizId } = request.params as { quizId: string };
      try {
        const newEndsAt = await extendQuizLobby(quizId);
        if (!newEndsAt) {
          return reply.code(400).send({ error: "lobby_not_active_or_max_extensions" });
        }
        return reply.send({ lobbyEndsAt: newEndsAt });
      } catch (err) {
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );

  // 4. Start Quiz immediately (Teacher only)
  app.post(
    "/quizzes/:quizId/start",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { quizId } = request.params as { quizId: string };
      try {
        await startQuiz(quizId);
        return reply.send({ ok: true });
      } catch (err) {
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );

  // 5. Answer Submission (Student only)
  app.post(
    "/quizzes/:quizId/attempts/:attemptId/answers",
    { preHandler: requireAuth(["student"]) },
    async (request, reply) => {
      const { quizId, attemptId } = request.params as { quizId: string; attemptId: string };
      const body = request.body as {
        questionId: string;
        selectedOption: string;
        timeRemainingSeconds: number;
      };

      if (!body.questionId || body.selectedOption === undefined || body.timeRemainingSeconds === undefined) {
        return reply.code(400).send({ error: "invalid_payload" });
      }

      const userId = request.auth.userId;
      const userAgent = request.headers["user-agent"] || "";
      const ip = request.ip;

      try {
        // Enforce active session constraints and write to integrity log if needed
        await getOrCreateAttempt(quizId, userId, attemptId, userAgent, ip);

        const result = await saveAnswer(
          quizId,
          attemptId,
          userId,
          body.questionId,
          body.selectedOption,
          body.timeRemainingSeconds,
          userAgent,
          ip
        );
        return reply.send({ ok: true, ...result });
      } catch (err) {
        if ((err as Error).message === "duplicate_device") {
          return reply.code(409).send({ error: "duplicate_device" });
        }
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );

  // 6. Reconnect state retrieval (Student only)
  app.get(
    "/quizzes/:quizId/attempts/:attemptId/state",
    { preHandler: requireAuth(["student"]) },
    async (request, reply) => {
      const { quizId, attemptId } = request.params as { quizId: string; attemptId: string };
      const userId = request.auth.userId;
      const userAgent = request.headers["user-agent"] || "";
      const ip = request.ip;

      try {
        await getOrCreateAttempt(quizId, userId, attemptId, userAgent, ip);

        const state = await getQuizState(quizId);
        if (!state) {
          return reply.code(404).send({ error: "quiz_not_active" });
        }

        let timeRemainingSeconds = 0;
        if (state.status === "lobby" && state.lobbyEndsAt) {
          timeRemainingSeconds = Math.max(0, Math.round((new Date(state.lobbyEndsAt).getTime() - Date.now()) / 1000));
        } else if (state.status === "active" && state.currentQuestionEndsAt) {
          timeRemainingSeconds = Math.max(0, Math.round((new Date(state.currentQuestionEndsAt).getTime() - Date.now()) / 1000));
        }

        return reply.send({
          currentQuestionIndex: state.currentQuestionIndex,
          timeRemainingSeconds,
          status: state.status,
        });
      } catch (err) {
        if ((err as Error).message === "duplicate_device") {
          return reply.code(409).send({ error: "duplicate_device" });
        }
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );

  // 7. AI Quiz Generation (Teacher only)
  app.post(
    "/courses/:courseId/quizzes/ai-generate",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { courseId } = request.params as { courseId: string };
      if (!teacherOwnsCourse(courseId)) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const body = request.body as AiQuizGenerationRequest;

      if (!body.topic || typeof body.topic !== "string" || !body.topic.trim()) {
        return reply.code(400).send({ error: "topic_required" });
      }

      const questionCount = Math.max(1, Math.min(body.questionCount || 10, 30));

      try {
        // Call Python AI service
        const aiServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";
        const aiResponse = await fetch(
          `${aiServiceUrl}/internal/courses/${courseId}/quizzes/ai-generate`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Internal-API-Key": process.env.INTERNAL_API_KEY || "",
            },
            body: JSON.stringify({
              courseId,
              topic: body.topic.trim(),
              questionCount,
            }),
          }
        );

        if (!aiResponse.ok) {
          const errorData = await aiResponse.json().catch(() => ({}));
          return reply
            .code(aiResponse.status)
            .send({ error: errorData.error || "ai_generation_failed" });
        }

        const { questions } = (await aiResponse.json()) as {
          questions: AiGeneratedQuestion[];
        };

        // Create draft quiz with AI-generated questions
        const quizTitle = `AI-Generated Quiz: ${body.topic}`;
        const quizId = await createAiQuiz(courseId, quizTitle, questions);

        // Return quiz with questions for teacher preview
        return reply.send({
          quizId,
          status: "draft",
          questions: questions.map((q, idx) => ({
            text: q.questionText,
            options: q.options,
            correctOptionIndex: q.correctOptionIndex,
            difficultyRating: q.difficultyRating,
            explanation: q.explanation,
            pointValue: q.pointValue,
            timeLimitSeconds: q.timeLimitSeconds,
          })),
        });
      } catch (err) {
        console.error("AI generation error:", err);
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );

  // 8. Edit Draft Question (Teacher only)
  app.patch(
    "/quizzes/:quizId/questions/:questionId",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { quizId, questionId } = request.params as {
        quizId: string;
        questionId: string;
      };

      try {
        await editQuestion(questionId, request.body as Record<string, unknown>);
        return reply.send({ ok: true });
      } catch (err) {
        const message = (err as Error).message;
        if (
          message === "question_not_found" ||
          message === "can_only_edit_draft_questions"
        ) {
          return reply.code(400).send({ error: message });
        }
        return reply.code(500).send({ error: message });
      }
    }
  );

  // 9. Delete Draft Question (Teacher only)
  app.delete(
    "/quizzes/:quizId/questions/:questionId",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { quizId, questionId } = request.params as {
        quizId: string;
        questionId: string;
      };

      try {
        await deleteQuestion(questionId);
        return reply.send({ ok: true });
      } catch (err) {
        const message = (err as Error).message;
        if (
          message === "question_not_found" ||
          message === "can_only_delete_draft_questions"
        ) {
          return reply.code(400).send({ error: message });
        }
        return reply.code(500).send({ error: message });
      }
    }
  );

  // 10. Add Manual Question to Draft Quiz (Teacher only)
  app.post(
    "/quizzes/:quizId/questions",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { quizId } = request.params as { quizId: string };

      try {
        const questionId = await addQuestion(quizId, request.body as AddQuestionRequest);
        return reply.send({ ok: true, questionId });
      } catch (err) {
        const message = (err as Error).message;
        if (
          message === "quiz_not_found" ||
          message === "can_only_add_to_draft_quiz" ||
          message.includes("must be between")
        ) {
          return reply.code(400).send({ error: message });
        }
        return reply.code(500).send({ error: message });
      }
    }
  );

  // 11. Publish Draft Quiz (Teacher only)
  app.patch(
    "/quizzes/:quizId/publish",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { quizId } = request.params as { quizId: string };

      try {
        const questionCount = await publishQuiz(quizId);
        return reply.send({
          quizId,
          status: "published",
          questionCount,
          publishedAt: new Date().toISOString(),
        });
      } catch (err) {
        const message = (err as Error).message;
        if (
          message === "quiz_not_found" ||
          message === "quiz_already_published" ||
          message === "no_questions_to_publish"
        ) {
          return reply.code(400).send({ error: message });
        }
        return reply.code(500).send({ error: message });
      }
    }
  );

  // 12. Void a question (Teacher only) - with detailed response
  app.post(
    "/quizzes/:quizId/questions/:questionId/void",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { quizId, questionId } = request.params as {
        quizId: string;
        questionId: string;
      };
      try {
        const response = await voidQuestionAndRecalculateWithResponse(quizId, questionId);
        return reply.send(response);
      } catch (err) {
        return reply.code(500).send({ error: (err as Error).message });
      }
    }
  );
}

