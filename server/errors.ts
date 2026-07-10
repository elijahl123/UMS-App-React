export type Params = Record<string, unknown>;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export function required(params: Params, key: string): unknown {
  const value = params[key];
  if (value === undefined || value === null || value === '') {
    throw new ApiError(`Missing required parameter: ${key}`, 400);
  }
  return value;
}
