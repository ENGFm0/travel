import { create } from 'zustand';
import type { PackCategory, TasksBoard } from './tasksModel';
import type { TasksService } from './tasksService';
import { createTasksService } from './tasksService';

interface TasksStore {
  service: TasksService | null;
  board: TasksBoard | null;
  loading: boolean;
  error: string | null;
  setService: (s: TasksService) => void;
  _set: (p: Partial<TasksStore>) => void;
}

export const useTasksStore = create<TasksStore>((set) => ({
  service: null,
  board: null,
  loading: false,
  error: null,
  setService: (service) => set({ service }),
  _set: (p) => set(p),
}));

export function initTasks(): void {
  if (!useTasksStore.getState().service) {
    useTasksStore.getState().setService(createTasksService());
  }
}

export function useTasksBoard() {
  const board = useTasksStore((s) => s.board);
  const loading = useTasksStore((s) => s.loading);
  const error = useTasksStore((s) => s.error);
  return { board, loading, error };
}

function svc(): TasksService {
  const s = useTasksStore.getState().service;
  if (!s) throw new Error('Tasks service not initialized');
  return s;
}

let activeTripId = '';
async function apply(fn: (tripId: string) => Promise<TasksBoard>): Promise<void> {
  useTasksStore.getState()._set({ error: null });
  try {
    const board = await fn(activeTripId);
    useTasksStore.getState()._set({ board });
  } catch {
    useTasksStore.getState()._set({ error: 'GENERIC' });
  }
}

export const tasksActions = {
  async load(tripId: string): Promise<void> {
    activeTripId = tripId;
    useTasksStore.getState()._set({ loading: true, error: null });
    try {
      const board = await svc().getBoard(tripId);
      useTasksStore.getState()._set({ board });
    } catch {
      useTasksStore.getState()._set({ error: 'GENERIC' });
    } finally {
      useTasksStore.getState()._set({ loading: false });
    }
  },
  addTask: (title: string, assigneeUid: string | null) => apply((t) => svc().addTask(t, title, assigneeUid)),
  toggleTask: (id: string) => apply((t) => svc().toggleTask(t, id)),
  deleteTask: (id: string) => apply((t) => svc().deleteTask(t, id)),
  addPack: (label: string, category: PackCategory) => apply((t) => svc().addPack(t, label, category)),
  togglePack: (id: string) => apply((t) => svc().togglePack(t, id)),
  deletePack: (id: string) => apply((t) => svc().deletePack(t, id)),
  applyTemplate: (items: { label: string; category: PackCategory }[]) => apply((t) => svc().applyTemplate(t, items)),
  toggleBooking: (id: string) => apply((t) => svc().toggleBooking(t, id)),
  reset: () => { activeTripId = ''; useTasksStore.getState()._set({ board: null, error: null }); },
};
