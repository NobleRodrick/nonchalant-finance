export class ActionError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "ActionError";
    this.code = code;
    this.details = details;
  }
}

export const unauthorized = (msg = "Please sign in to continue") => new ActionError("UNAUTHORIZED", msg);
export const forbidden = (msg = "You do not have permission to do this") => new ActionError("FORBIDDEN", msg);
export const notFound = (msg = "Record not found") => new ActionError("NOT_FOUND", msg);
export const invalid = (msg, details) => new ActionError("VALIDATION", msg, details);
export const conflict = (msg) => new ActionError("CONFLICT", msg);
