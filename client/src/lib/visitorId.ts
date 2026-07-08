// Anonymous visitor identity. This is the ONLY thing this app stores in
// localStorage — a single opaque random ID used to scope data to "this
// browser" on the server. All actual app data (logs, goals, health score
// settings, etc.) still lives entirely in Postgres via the API; the client
// remains stateless for that data. This ID is just a pseudonymous token
// sent with every request so the server can tell one anonymous visitor
// apart from another.
const STORAGE_KEY = "diet-tracker:visitor-id";

export function getVisitorId(): string {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}
