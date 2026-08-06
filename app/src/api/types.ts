export type ErrorCode = "HTTP" | "NETWORK" | "TOKEN_INVALID" | "SCHEMA" | "NO_DATA" | "UNKNOWN";

export interface ResultError {
  code: ErrorCode;
  message: string;
}

export type Result<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: ResultError };
