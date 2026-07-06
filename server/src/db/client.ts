import "../env.js";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "shared";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Check your .env file.");
}

// neon-http: stateless HTTP driver over the pooled endpoint. Fits this
// low-traffic single-user API without managing a persistent connection pool.
const sql = neon(connectionString);

export const db = drizzle(sql, { schema });
