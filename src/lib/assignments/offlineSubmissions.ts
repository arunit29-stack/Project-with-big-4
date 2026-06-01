import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PendingOfflineSubmission } from "@/types/assignment-offline";

interface OfflineDB extends DBSchema {
  pending: {
    key: string;
    value: PendingOfflineSubmission;
  };
}

const DB_NAME = "cbb-offline-submissions";
const STORE = "pending";

let dbPromise: Promise<IDBPDatabase<OfflineDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDB>(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE, { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

export async function saveOfflineSubmission(
  entry: PendingOfflineSubmission,
): Promise<void> {
  const db = await getDb();
  await db.put(STORE, entry);
}

export async function getOfflineSubmissionsForAssignment(
  courseId: string,
  assignmentId: string,
): Promise<PendingOfflineSubmission[]> {
  const db = await getDb();
  const all = await db.getAll(STORE);
  return all.filter(
    (s) => s.courseId === courseId && s.assignmentId === assignmentId,
  );
}

export async function getAllOfflineSubmissions(): Promise<
  PendingOfflineSubmission[]
> {
  const db = await getDb();
  return db.getAll(STORE);
}

export async function removeOfflineSubmission(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, id);
}
