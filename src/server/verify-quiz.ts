/* eslint-disable */
import { io as ClientIO } from "socket.io-client";
import { buildApp } from "./fastify/app";

// Helper to make API calls
async function apiRequest(url: string, method: string, body?: any, token?: string): Promise<any> {
  const headers: any = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status >= 400 && res.status !== 409) {
    throw new Error(`API returned ${res.status}: ${await res.text()}`);
  }
  if (res.status === 409) {
    return { status: 409, ...(await res.json()) };
  }
  return res.json();
}

async function runTests() {
  console.log("Starting Quiz Engine Verification Tests...");
  
  const app = await buildApp();
  const testPort = 4444;
  await app.listen({ port: testPort, host: "127.0.0.1" });
  console.log(`Test Fastify app listening on http://127.0.0.1:${testPort}`);

  const baseUrl = `http://127.0.0.1:${testPort}`;

  try {
    // 1. Log in demo teacher and student
    console.log("Logging in users...");
    const teacherLogin = await apiRequest(`${baseUrl}/auth/login`, "POST", {
      email: "teacher@cbb.edu",
      password: "password",
    });
    const teacherToken = teacherLogin.token;

    const studentLogin = await apiRequest(`${baseUrl}/auth/login`, "POST", {
      email: "student@cbb.edu",
      password: "password",
    });
    const studentToken = studentLogin.token;
    const studentUserId = studentLogin.user.id;

    console.log("Teacher and student successfully logged in.");

    // 2. Create Quiz
    console.log("Creating quiz...");
    const quizPayload = {
      title: "Cell Biology Trivia",
      questions: [
        {
          type: "mcq",
          text: "What is the powerhouse of the cell?",
          options: ["Nucleus", "Ribosome", "Mitochondria", "Lysosome"],
          correctOptionIndex: 2,
          pointValue: 20,
          timeLimitSeconds: 15,
        },
        {
          type: "true_false",
          text: "Prokaryotic cells have a nucleus.",
          options: ["True", "False"],
          correctOptionIndex: 1,
          pointValue: 10,
          timeLimitSeconds: 10,
        },
      ],
    };

    const quizRes = await apiRequest(
      `${baseUrl}/courses/course-bio-101/quizzes`,
      "POST",
      quizPayload,
      teacherToken
    );
    const quizId = quizRes.quizId;
    console.log(`Quiz created successfully with ID: ${quizId}`);

    // Fetch quiz questions from DB to get question IDs
    const pool = (app as any).server; // fastify instance's pg connection is direct or we query DB
    const { getPostgresPool } = require("../lib/server/db/postgres");
    const dbPool = getPostgresPool();
    const questionsRes = await dbPool.query(
      `SELECT * FROM quiz_questions WHERE quiz_id = $1 ORDER BY question_index ASC`,
      [quizId]
    );
    const questions = questionsRes.rows;
    console.log(`Fetched ${questions.length} questions from DB.`);

    // 3. Launch lobby
    console.log("Launching quiz lobby...");
    const launchRes = await apiRequest(
      `${baseUrl}/quizzes/${quizId}/launch`,
      "POST",
      {},
      teacherToken
    );
    console.log(`Lobby launched. Ends at: ${launchRes.lobbyEndsAt}`);

    // 4. Connect sockets
    console.log("Connecting student and teacher sockets...");
    const teacherSocket = ClientIO(`${baseUrl}/quizzes/${quizId}`, {
      auth: { token: teacherToken },
      transports: ["websocket"],
    });

    const studentSocket = ClientIO(`${baseUrl}/quizzes/${quizId}`, {
      auth: { token: studentToken },
      transports: ["websocket"],
    });

    let studentJoinedReceived = false;
    teacherSocket.on("quiz:student_joined", (data: any) => {
      console.log("Teacher received quiz:student_joined event:", data);
      if (data.userId === studentUserId) {
        studentJoinedReceived = true;
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    if (!studentJoinedReceived) {
      throw new Error("Teacher did not receive quiz:student_joined Socket.io event.");
    }
    console.log("Real-time lobby attendance verification passed.");

    // 5. Extend lobby
    console.log("Extending lobby...");
    const extendRes = await apiRequest(
      `${baseUrl}/quizzes/${quizId}/lobby/extend`,
      "POST",
      {},
      teacherToken
    );
    console.log(`Lobby extended. New end time: ${extendRes.lobbyEndsAt}`);

    // 6. Start Quiz
    console.log("Starting quiz...");
    let questionPushed = false;
    let questionData: any = null;

    studentSocket.on("quiz:question", (data: any) => {
      console.log("Student received quiz:question event:", data);
      questionPushed = true;
      questionData = data;
    });

    await apiRequest(`${baseUrl}/quizzes/${quizId}/start`, "POST", {}, teacherToken);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (!questionPushed || questionData.questionIndex !== 0) {
      throw new Error("Question push event not received by client.");
    }
    console.log("Question push Socket.io broadcast verification passed.");

    // 7. Submit Answer (speed bonus check)
    console.log("Submitting first question answer...");
    const attemptId = "attempt-uuid-1111";
    // First question time limit is 15s. If timeRemaining is 10s (>= 7.5), multiplier is 1.5x -> points: 20 * 1.5 = 30.
    const answerRes = await apiRequest(
      `${baseUrl}/quizzes/${quizId}/attempts/${attemptId}/answers`,
      "POST",
      {
        questionId: questions[0].id,
        selectedOption: "2", // correct MCQ option (Mitochondria)
        timeRemainingSeconds: 10,
      },
      studentToken
    );
    console.log("Answer submission response:", answerRes);
    if (!answerRes.ok || answerRes.pointsAwarded !== 30) {
      throw new Error(`Scoring speed bonus check failed. Got points: ${answerRes.pointsAwarded}, expected: 30.`);
    }
    console.log("Scoring speed bonus verification passed.");

    // 8. Reconnect state check
    console.log("Retrieving state on student reconnect...");
    const stateRes = await apiRequest(
      `${baseUrl}/quizzes/${quizId}/attempts/${attemptId}/state`,
      "GET",
      null,
      studentToken
    );
    console.log("Reconnect state:", stateRes);
    if (stateRes.currentQuestionIndex !== 0) {
      throw new Error(`State restoration failed. Got questionIndex ${stateRes.currentQuestionIndex}, expected: 0.`);
    }
    console.log("State restoration verification passed.");

    // 9. Check duplicate device rejection (409 Conflict)
    console.log("Checking duplicate device block...");
    const duplicateRes = await apiRequest(
      `${baseUrl}/quizzes/${quizId}/attempts/attempt-uuid-2222/answers`,
      "POST",
      {
        questionId: questions[0].id,
        selectedOption: "1",
        timeRemainingSeconds: 8,
      },
      studentToken
    );
    console.log("Duplicate attempt response:", duplicateRes);
    if (duplicateRes.status !== 409) {
      throw new Error("Duplicate device session was not blocked with 409.");
    }
    console.log("Duplicate device block verification passed.");

    // Verify integrity log flag
    const logsRes = await dbPool.query(
      `SELECT * FROM quiz_integrity_log WHERE quiz_id = $1 AND user_id = $2`,
      [quizId, studentUserId]
    );
    if (logsRes.rowCount === 0) {
      throw new Error("Duplicate device check did not log an integrity entry.");
    }
    console.log("Integrity logging verification passed.");

    // 10. Transition to next question, submit incorrect answer, and end quiz
    console.log("Transitioning to second question...");
    const nextQuestionPromise = new Promise((resolve) => {
      studentSocket.on("quiz:question", (data: any) => {
        if (data.questionIndex === 1) resolve(data);
      });
    });

    const coordinator = require("../lib/server/quiz/coordinator");
    await coordinator.transitionToQuestion(quizId, 1);
    await nextQuestionPromise;

    console.log("Submitting incorrect answer for second question...");
    const answer2Res = await apiRequest(
      `${baseUrl}/quizzes/${quizId}/attempts/${attemptId}/answers`,
      "POST",
      {
        questionId: questions[1].id,
        selectedOption: "0", // incorrect
        timeRemainingSeconds: 8,
      },
      studentToken
    );
    if (answer2Res.pointsAwarded !== 0) {
      throw new Error(`Scoring check for incorrect answer failed. Got points: ${answer2Res.pointsAwarded}, expected: 0.`);
    }

    // End Quiz
    console.log("Ending quiz...");
    await coordinator.endQuiz(quizId);

    // Verify completed attempt scores
    const attemptRow = await dbPool.query(
      `SELECT * FROM quiz_attempts WHERE id = $1`,
      [attemptId]
    );
    console.log("Final quiz attempt record:", attemptRow.rows[0]);
    if (Number(attemptRow.rows[0].score) !== 30) {
      throw new Error(`Final score mismatch. Got ${attemptRow.rows[0].score}, expected: 30.`);
    }

    const ledgerRow = await dbPool.query(
      `SELECT * FROM student_xp_ledger WHERE quiz_id = $1 AND user_id = $2`,
      [quizId, studentUserId]
    );
    console.log("Final XP ledger record:", ledgerRow.rows[0]);
    if (ledgerRow.rows[0].xp_amount !== 30) {
      throw new Error(`Final XP ledger amount mismatch. Got ${ledgerRow.rows[0].xp_amount}, expected: 30.`);
    }

    // 11. Void question and redistribute points
    console.log("Voiding first question...");
    const voidRes = await apiRequest(
      `${baseUrl}/quizzes/${quizId}/questions/${questions[0].id}/void`,
      "POST",
      {},
      teacherToken
    );
    console.log("Void question response:", voidRes);

    // After voiding question 0 (initial points: 20):
    // Only question 1 (initial points: 10) remains active.
    // Proportional redistribution factor: Total Initial Points (20 + 10 = 30) / Active Initial Points (10) = 3.0.
    // The student got question 0 correct (original points 30, but question 0 is voided -> now 0 points).
    // The student got question 1 incorrect (points 0 * 3.0 = 0).
    // So final recalculated score should be 0.
    // Let's verify this.
    const attemptVoidRow = await dbPool.query(
      `SELECT * FROM quiz_attempts WHERE id = $1`,
      [attemptId]
    );
    console.log("Recalculated quiz attempt record:", attemptVoidRow.rows[0]);
    if (Number(attemptVoidRow.rows[0].score) !== 0) {
      throw new Error(`Recalculated score mismatch. Got ${attemptVoidRow.rows[0].score}, expected: 0.`);
    }
    console.log("Question voiding and score redistribution verification passed.");

    console.log("ALL TESTS COMPLETED SUCCESSFULLY!");
    
    // Disconnect sockets and shut down
    teacherSocket.disconnect();
    studentSocket.disconnect();
    await app.close();
    process.exit(0);

  } catch (err) {
    console.error("Test execution failed:", err);
    await app.close();
    process.exit(1);
  }
}

runTests();
