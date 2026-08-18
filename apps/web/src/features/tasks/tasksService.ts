import { createApiClient } from '@boardingpass/core';
import {
  BOOKING_ITEMS, dedupeAppend, type BookingItem, type PackCategory,
  type Task, type TasksBoard,
} from './tasksModel';

export interface TasksService {
  getBoard(tripId: string): Promise<TasksBoard>;
  addTask(tripId: string, title: string, assigneeUid: string | null): Promise<TasksBoard>;
  toggleTask(tripId: string, id: string): Promise<TasksBoard>;
  deleteTask(tripId: string, id: string): Promise<TasksBoard>;
  addPack(tripId: string, label: string, category: PackCategory): Promise<TasksBoard>;
  togglePack(tripId: string, id: string): Promise<TasksBoard>;
  deletePack(tripId: string, id: string): Promise<TasksBoard>;
  applyTemplate(tripId: string, items: { label: string; category: PackCategory }[]): Promise<TasksBoard>;
  toggleBooking(tripId: string, id: string): Promise<TasksBoard>;
}

const uid = (p: string) => `${p}-${crypto.randomUUID()}`;

/** In-memory tasks service for dev/tests. NOT a security boundary — the server
 *  enforces member-write / viewer-read, assignee integrity, and audit. */
export function createMockTasksService(seed?: Record<string, TasksBoard>): TasksService {
  const boards = new Map<string, TasksBoard>();
  if (seed) for (const [k, v] of Object.entries(seed)) boards.set(k, structuredClone(v));
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));

  function board(tripId: string): TasksBoard {
    let b = boards.get(tripId);
    if (!b) {
      b = {
        tasks: [],
        packing: [],
        bookings: BOOKING_ITEMS.map((x): BookingItem => ({ id: x.id, group: x.group, done: false })),
      };
      boards.set(tripId, b);
    }
    return b;
  }
  const snap = (tripId: string) => structuredClone(boards.get(tripId)!) as TasksBoard;

  return {
    async getBoard(tripId) { await tick(); board(tripId); return snap(tripId); },
    async addTask(tripId, title, assigneeUid) {
      await tick();
      board(tripId).tasks.push({ id: uid('t'), title: title.trim(), assigneeUid, done: false });
      return snap(tripId);
    },
    async toggleTask(tripId, id) {
      await tick();
      const t = board(tripId).tasks.find((x) => x.id === id);
      if (t) t.done = !t.done;
      return snap(tripId);
    },
    async deleteTask(tripId, id) {
      await tick();
      const b = board(tripId); b.tasks = b.tasks.filter((x) => x.id !== id);
      return snap(tripId);
    },
    async addPack(tripId, label, category) {
      await tick();
      const b = board(tripId);
      const add = dedupeAppend(b.packing, [{ label: label.trim(), category }]);
      for (const a of add) b.packing.push({ id: uid('p'), label: a.label, category: a.category, checked: false });
      return snap(tripId);
    },
    async togglePack(tripId, id) {
      await tick();
      const p = board(tripId).packing.find((x) => x.id === id);
      if (p) p.checked = !p.checked;
      return snap(tripId);
    },
    async deletePack(tripId, id) {
      await tick();
      const b = board(tripId); b.packing = b.packing.filter((x) => x.id !== id);
      return snap(tripId);
    },
    async applyTemplate(tripId, items) {
      await tick();
      const b = board(tripId);
      const add = dedupeAppend(b.packing, items); // BR-008-002 dedupe
      for (const a of add) b.packing.push({ id: uid('p'), label: a.label, category: a.category, checked: false });
      return snap(tripId);
    },
    async toggleBooking(tripId, id) {
      await tick();
      const x = board(tripId).bookings.find((y) => y.id === id);
      if (x) x.done = !x.done;
      return snap(tripId);
    },
  };
}

export function createApiTasksService(getToken?: () => string | undefined): TasksService {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';
  const client = createApiClient({ baseUrl: base, getToken });
  const board = (tripId: string) => client.apiFetch<TasksBoard>(`/trips/${tripId}/tasks-board`);
  const del = async (tripId: string, path: string) => { await client.apiFetch<void>(path, { method: 'DELETE' }); return board(tripId); };
  return {
    getBoard: (tripId) => board(tripId),
    addTask: (tripId, title, assigneeUid) => client.apiFetch<TasksBoard>(`/trips/${tripId}/tasks`, { method: 'POST', body: JSON.stringify({ title, assigneeUid }) }),
    toggleTask: (tripId, id) => client.apiFetch<TasksBoard>(`/trips/${tripId}/tasks/${id}/toggle`, { method: 'PATCH' }),
    deleteTask: (tripId, id) => del(tripId, `/trips/${tripId}/tasks/${id}`),
    addPack: (tripId, label, category) => client.apiFetch<TasksBoard>(`/trips/${tripId}/packing`, { method: 'POST', body: JSON.stringify({ label, category }) }),
    togglePack: (tripId, id) => client.apiFetch<TasksBoard>(`/trips/${tripId}/packing/${id}/toggle`, { method: 'PATCH' }),
    deletePack: (tripId, id) => del(tripId, `/trips/${tripId}/packing/${id}`),
    applyTemplate: (tripId, items) => client.apiFetch<TasksBoard>(`/trips/${tripId}/packing/template`, { method: 'POST', body: JSON.stringify({ items }) }),
    toggleBooking: (tripId, id) => client.apiFetch<TasksBoard>(`/trips/${tripId}/bookings/${id}/toggle`, { method: 'PATCH' }),
  };
}

export function createTasksService(): TasksService {
  return import.meta.env.VITE_API_BASE_URL ? createApiTasksService() : createMockTasksService();
}

export type { Task, TasksBoard };
