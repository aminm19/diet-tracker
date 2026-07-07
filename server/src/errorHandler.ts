import type { ErrorHandler } from "hono";
import { InvalidServingSizeError } from "./services/logs.js";

// Maps known domain-error classes (thrown by service functions) to HTTP
// status codes, so route handlers can `throw` instead of hand-rolling a
// try/catch per handler. Add a new [ErrorClass, status] pair here as new
// domain errors are introduced.
const DOMAIN_ERRORS: [errorClass: new (...args: never[]) => Error, status: 400][] = [
  [InvalidServingSizeError, 400],
];

export const onError: ErrorHandler = (err, c) => {
  for (const [ErrorClass, status] of DOMAIN_ERRORS) {
    if (err instanceof ErrorClass) {
      return c.json({ error: err.message }, status);
    }
  }

  // Unexpected error: fall back to Hono's default unhandled-error behavior
  // (log + plain-text 500) rather than swallowing or masking it.
  console.error(err);
  return c.text("Internal Server Error", 500);
};
