// Tiny client-side API helper used by the admin panel.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function handle(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error || res.statusText, res.status);
  return data;
}

export function apiGet(path: string) {
  return fetch(path, { credentials: 'same-origin', cache: 'no-store' }).then(handle);
}

export function apiSend(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
  headers?: Record<string, string>,
) {
  return fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then(handle);
}

export function apiPutBinary(path: string, body: Blob) {
  return fetch(path, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/octet-stream' },
    body,
  }).then(handle);
}

export function apiUpload(path: string, form: FormData) {
  return fetch(path, { method: 'POST', credentials: 'same-origin', body: form }).then(handle);
}
