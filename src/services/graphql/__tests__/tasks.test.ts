// src/services/graphql/__tests__/tasks.test.ts
// Unit tests for the tasks GraphQL service functions.
//
// The device header is NOT asserted here any more. These tests used to check
// that each function passed `{ withDeviceToken: true }` as a third argument,
// which pinned the opt-in in place rather than testing anything: the header was
// attached only when a call site remembered the flag, and the ones that forgot
// (incomingOnlineOrders, myStaff) failed for staff with "Please log in from a
// registered device". The client now attaches it unconditionally, and that is
// asserted once in config/__tests__/deviceHeader.test.ts.
//
// gqlMyTasks-specific behaviour:
//   - default filter is { limit: 200 }
//   - a partial caller filter is MERGED with the default (caller wins on overlap)
//   - result is res.myTasks (the array sitting directly on the response key)

jest.mock('../../../config/graphql', () => ({
  graphqlRequest: jest.fn(),
}));

import { graphqlRequest } from '../../../config/graphql';
import {
  gqlMyTasks,
  gqlCreateTask,
  gqlUpdateTask,
  gqlDeleteTask,
  gqlCompleteTask,
} from '../tasks';

const mockGql = graphqlRequest as jest.Mock;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeTask = (overrides: Record<string, unknown> = {}) => ({
  _id: 'task-001',
  uid: 'merchant-001',
  title: 'Clean machines',
  priority: 'medium',
  isCompleted: false,
  isVisibleToStaff: true,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...overrides,
});

const TASK_ID = 'task-001';

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGql.mockReset();
});

// ─── gqlMyTasks ──────────────────────────────────────────────────────────────

describe('gqlMyTasks', () => {
  it('HP: returns the array from res.myTasks', async () => {
    const tasks = [makeTask(), makeTask({ _id: 'task-002', title: 'Restock soap' })];
    mockGql.mockResolvedValueOnce({ myTasks: tasks });

    const result = await gqlMyTasks();

    expect(result).toEqual(tasks);
  });

  it('HP: with no filter argument, passes { limit: 200 } as the filter variable', async () => {
    mockGql.mockResolvedValueOnce({ myTasks: [] });

    await gqlMyTasks();

    const [, vars] = mockGql.mock.calls[0];
    expect(vars.filter ?? vars).toMatchObject({ limit: 200 });
  });

  it('HP: merges caller filter with default { limit: 200 } — caller extra props are included', async () => {
    mockGql.mockResolvedValueOnce({ myTasks: [] });

    await gqlMyTasks({ isCompleted: false });

    const [, vars] = mockGql.mock.calls[0];
    const filter = vars?.filter ?? vars;
    expect(filter).toMatchObject({ limit: 200, isCompleted: false });
  });

  it('HP: caller-supplied limit overrides the default limit of 200', async () => {
    mockGql.mockResolvedValueOnce({ myTasks: [] });

    await gqlMyTasks({ limit: 50 });

    const [, vars] = mockGql.mock.calls[0];
    const filter = vars?.filter ?? vars;
    expect(filter).toMatchObject({ limit: 50 });
  });


  it('HP: calls graphqlRequest with a query string (first arg is a string)', async () => {
    mockGql.mockResolvedValueOnce({ myTasks: [] });

    await gqlMyTasks();

    const [query] = mockGql.mock.calls[0];
    expect(typeof query).toBe('string');
    expect(query.length).toBeGreaterThan(0);
  });

  it('EC: propagates errors thrown by graphqlRequest', async () => {
    mockGql.mockRejectedValueOnce(new Error('Fetch failed'));

    await expect(gqlMyTasks()).rejects.toThrow('Fetch failed');
  });
});

// ─── gqlCreateTask ───────────────────────────────────────────────────────────

describe('gqlCreateTask', () => {
  const createInput = {
    title: 'Wipe counters',
    priority: 'high' as const,
    isVisibleToStaff: true,
  };

  it('HP: calls graphqlRequest with the create mutation and correct input', async () => {
    mockGql.mockResolvedValueOnce({ createTask: makeTask({ title: 'Wipe counters' }) });

    await gqlCreateTask(createInput);

    expect(mockGql).toHaveBeenCalledTimes(1);
    expect(mockGql).toHaveBeenCalledWith(
      expect.stringMatching(/createTask|CreateTask/),
      { input: createInput },
    );
  });


  it('HP: returns the created task from the mutation response', async () => {
    const newTask = makeTask({ title: 'Wipe counters', priority: 'high' });
    mockGql.mockResolvedValueOnce({ createTask: newTask });

    const result = await gqlCreateTask(createInput);

    expect(result).toEqual(newTask);
  });

  it('EC: propagates errors thrown by graphqlRequest', async () => {
    mockGql.mockRejectedValueOnce(new Error('Create failed'));

    await expect(gqlCreateTask(createInput)).rejects.toThrow('Create failed');
  });
});

// ─── gqlUpdateTask ───────────────────────────────────────────────────────────

describe('gqlUpdateTask', () => {
  const updateInput = { title: 'Deep clean machines', priority: 'high' as const };

  it('HP: calls graphqlRequest with the update mutation, task id, and input', async () => {
    mockGql.mockResolvedValueOnce({ updateTask: makeTask({ title: 'Deep clean machines' }) });

    await gqlUpdateTask(TASK_ID, updateInput);

    expect(mockGql).toHaveBeenCalledTimes(1);
    expect(mockGql).toHaveBeenCalledWith(
      expect.stringMatching(/updateTask|UpdateTask/),
      { id: TASK_ID, input: updateInput },
    );
  });


  it('HP: returns the updated task from the mutation response', async () => {
    const updated = makeTask({ title: 'Deep clean machines' });
    mockGql.mockResolvedValueOnce({ updateTask: updated });

    const result = await gqlUpdateTask(TASK_ID, updateInput);

    expect(result).toEqual(updated);
  });

  it('EC: propagates errors thrown by graphqlRequest', async () => {
    mockGql.mockRejectedValueOnce(new Error('Update failed'));

    await expect(gqlUpdateTask(TASK_ID, updateInput)).rejects.toThrow('Update failed');
  });
});

// ─── gqlDeleteTask ───────────────────────────────────────────────────────────

describe('gqlDeleteTask', () => {
  it('HP: calls graphqlRequest with the delete mutation and task id', async () => {
    mockGql.mockResolvedValueOnce({ deleteTask: true });

    await gqlDeleteTask(TASK_ID);

    expect(mockGql).toHaveBeenCalledTimes(1);
    expect(mockGql).toHaveBeenCalledWith(
      expect.stringMatching(/deleteTask|DeleteTask/),
      { id: TASK_ID },
    );
  });

  it('HP: returns void (undefined) on success — does not throw', async () => {
    mockGql.mockResolvedValueOnce({ deleteTask: true });

    const result = await gqlDeleteTask(TASK_ID);

    expect(result).toBeUndefined();
  });


  it('EC: propagates errors thrown by graphqlRequest', async () => {
    mockGql.mockRejectedValueOnce(new Error('Delete failed'));

    await expect(gqlDeleteTask(TASK_ID)).rejects.toThrow('Delete failed');
  });
});

// ─── gqlCompleteTask ─────────────────────────────────────────────────────────

describe('gqlCompleteTask', () => {
  it('HP: calls graphqlRequest with the complete mutation and task id', async () => {
    mockGql.mockResolvedValueOnce({ completeTask: makeTask({ isCompleted: true }) });

    await gqlCompleteTask(TASK_ID);

    expect(mockGql).toHaveBeenCalledTimes(1);
    expect(mockGql).toHaveBeenCalledWith(
      expect.stringMatching(/completeTask|CompleteTask/),
      expect.objectContaining({ id: TASK_ID }),
    );
  });

  it('HP: includes optional noteText when provided', async () => {
    mockGql.mockResolvedValueOnce({ completeTask: makeTask({ isCompleted: true }) });

    await gqlCompleteTask(TASK_ID, 'Cleaned and sanitised all surfaces');

    const [, vars] = mockGql.mock.calls[0];
    expect(vars).toMatchObject({ noteText: 'Cleaned and sanitised all surfaces' });
  });

  it('HP: includes optional photoUri when provided', async () => {
    mockGql.mockResolvedValueOnce({ completeTask: makeTask({ isCompleted: true }) });

    await gqlCompleteTask(TASK_ID, undefined, 'file:///photos/task-001.jpg');

    const [, vars] = mockGql.mock.calls[0];
    expect(vars).toMatchObject({ photoUri: 'file:///photos/task-001.jpg' });
  });

  it('HP: includes both noteText and photoUri when both are provided', async () => {
    mockGql.mockResolvedValueOnce({ completeTask: makeTask({ isCompleted: true }) });

    await gqlCompleteTask(TASK_ID, 'Done', 'file:///photos/task-001.jpg');

    const [, vars] = mockGql.mock.calls[0];
    expect(vars).toMatchObject({ id: TASK_ID, noteText: 'Done', photoUri: 'file:///photos/task-001.jpg' });
  });


  it('HP: returns the completed task from the mutation response', async () => {
    const completed = makeTask({ isCompleted: true });
    mockGql.mockResolvedValueOnce({ completeTask: completed });

    const result = await gqlCompleteTask(TASK_ID);

    expect(result).toEqual(completed);
  });

  it('EC: propagates errors thrown by graphqlRequest', async () => {
    mockGql.mockRejectedValueOnce(new Error('Complete failed'));

    await expect(gqlCompleteTask(TASK_ID)).rejects.toThrow('Complete failed');
  });
});
