// src/services/graphql/tasks.ts
// GraphQL operations for the tasks domain.

import { graphqlRequest } from "../../config/graphql";

// ─── BE shapes ────────────────────────────────────────────────────────────────

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface GqlTask {
  _id: string;
  uid: string;
  branchId?: string;
  title: string;
  description?: string;
  assignedToId?: string;
  assignedToName?: string;
  priority: TaskPriority;
  category?: string;
  source?: string;
  dueDate?: string;
  isCompleted: boolean;
  completedBy?: string;
  completedAt?: string;
  noteText?: string;
  photoUri?: string;
  isVisibleToStaff: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateTaskInput {
  branchId?: string;
  title: string;
  description?: string;
  assignedToId?: string;
  assignedToName?: string;
  priority?: TaskPriority;
  category?: string;
  source?: string;
  dueDate?: string;
  isVisibleToStaff?: boolean;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  assignedToId?: string;
  assignedToName?: string;
  priority?: TaskPriority;
  category?: string;
  source?: string;
  dueDate?: string;
  isCompleted?: boolean;
  completedBy?: string;
  noteText?: string;
  photoUri?: string;
  isVisibleToStaff?: boolean;
}

// ─── Fields ───────────────────────────────────────────────────────────────────

const TASK_FIELDS = `
  _id uid branchId title description
  assignedToId assignedToName priority category source dueDate
  isCompleted completedBy completedAt
  noteText photoUri isVisibleToStaff
  createdAt updatedAt
`;

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function gqlMyTasks(filter?: {
  branchId?: string;
  isCompleted?: boolean;
  isVisibleToStaff?: boolean;
  limit?: number;
  offset?: number;
}): Promise<GqlTask[]> {
  const res = await graphqlRequest<{ myTasks: GqlTask[] }>(`
    query MyTasks($filter: TaskFilterInput) {
      myTasks(filter: $filter) { ${TASK_FIELDS} }
    }
  `, { filter: { limit: 200, ...filter } });
  return res.myTasks;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function gqlCreateTask(input: CreateTaskInput): Promise<GqlTask> {
  const res = await graphqlRequest<{ createTask: GqlTask }>(`
    mutation CreateTask($input: CreateTaskInput!) {
      createTask(input: $input) { ${TASK_FIELDS} }
    }
  `, { input });
  return res.createTask;
}

export async function gqlUpdateTask(id: string, input: UpdateTaskInput): Promise<GqlTask> {
  const res = await graphqlRequest<{ updateTask: GqlTask }>(`
    mutation UpdateTask($id: ID!, $input: UpdateTaskInput!) {
      updateTask(id: $id, input: $input) { ${TASK_FIELDS} }
    }
  `, { id, input });
  return res.updateTask;
}

export async function gqlDeleteTask(id: string): Promise<void> {
  await graphqlRequest(`
    mutation DeleteTask($id: ID!) { deleteTask(id: $id) { _id } }
  `, { id });
}

export async function gqlCompleteTask(
  id: string,
  noteText?: string,
  photoUri?: string,
): Promise<GqlTask> {
  const res = await graphqlRequest<{ completeTask: GqlTask }>(`
    mutation CompleteTask($id: ID!, $noteText: String, $photoUri: String) {
      completeTask(id: $id, noteText: $noteText, photoUri: $photoUri) {
        ${TASK_FIELDS}
      }
    }
  `, { id, noteText, photoUri });
  return res.completeTask;
}
