// Thin fetch wrapper around the log/food API. Plain `fetch` per project
// convention (no data-fetching library) — race-safety and caching for the
// daily log view are handled by `useDailyLog`, not here.
import type {
  CreateLogRequest,
  Food,
  GetLogsResponse,
  Goals,
  HealthScoreResult,
  HealthScoreSettings,
  LogEntry,
  UpdateLogRequest,
} from "shared";
import { getVisitorId } from "./visitorId";

const API_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Visitor-Id": getVisitorId(),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let message = res.statusText || `Request failed with status ${res.status}`;
    try {
      const body: unknown = await res.json();
      if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
        message = body.error;
      }
    } catch {
      // Response body wasn't JSON — fall back to statusText above.
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export function searchFoods(query: string, signal?: AbortSignal): Promise<Food[]> {
  return request<Food[]>(`/api/foods/search?q=${encodeURIComponent(query)}`, { signal });
}

export function getFoodById(id: number, signal?: AbortSignal): Promise<Food> {
  return request<Food>(`/api/foods/${id}`, { signal });
}

export function getLogs(date: string, signal?: AbortSignal): Promise<GetLogsResponse> {
  return request<GetLogsResponse>(`/api/logs?date=${date}`, { signal });
}

export function createLog(body: CreateLogRequest): Promise<LogEntry> {
  return request<LogEntry>("/api/logs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateLog(id: number, body: UpdateLogRequest): Promise<LogEntry> {
  return request<LogEntry>(`/api/logs/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteLog(id: number): Promise<void> {
  return request<void>(`/api/logs/${id}`, { method: "DELETE" });
}

export function getGoals(signal?: AbortSignal): Promise<Goals | null> {
  return request<Goals | null>("/api/goals", { signal });
}

export function updateGoals(goals: Goals): Promise<Goals> {
  return request<Goals>("/api/goals", {
    method: "PUT",
    body: JSON.stringify(goals),
  });
}

export function getHealthScoreSettings(): Promise<HealthScoreSettings> {
  return request<HealthScoreSettings>("/api/health-score/settings");
}

export function updateHealthScoreSettings(settings: HealthScoreSettings): Promise<HealthScoreSettings> {
  return request<HealthScoreSettings>("/api/health-score/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export function getHealthScore(date: string): Promise<HealthScoreResult> {
  return request<HealthScoreResult>(`/api/health-score?date=${date}`);
}
