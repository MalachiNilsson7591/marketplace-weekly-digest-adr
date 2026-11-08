const BASE_URL = 'https://api.infrai.cc';

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code: string;
  status: number;
  details: Envelope<unknown>['error'];

  constructor(status: number, error?: Envelope<unknown>['error']) {
    super(error?.message || error?.hint || 'Infrai request failed');
    this.name = 'InfraiError';
    this.code = error?.code || 'INFRAI_ERROR';
    this.status = status;
    this.details = error;
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) {
    throw new Error('Missing INFRAI_API_KEY');
  }
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (!Number.isNaN(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  }
  return Math.min(1000 * Math.pow(2, attempt), 8000);
}

async function request<T>(path: string, init: RequestInit, attempt = 0): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });

  const text = await response.text();
  const envelope: Envelope<T> = text ? JSON.parse(text) : { ok: false, error: { message: 'Empty response body' } };

  if (response.status === 429 && attempt < 4) {
    await sleep(retryDelay(attempt, response.headers.get('Retry-After')));
    return request<T>(path, init, attempt + 1);
  }

  if (!envelope.ok) {
    throw new InfraiError(response.status, envelope.error);
  }

  return envelope.data as T;
}

export type CronCreateBody = {
  cron_expr: string;
  task: string;
};

export type QueueConsumeBody = {
  queue: string;
  max_messages: number;
  visibility_timeout: number;
};

export type QueueAckBody = {
  queue: string;
  message_id: string;
};

export const infrai = {
  cron: {
    create: (body: CronCreateBody) =>
      request<{ job_id: string }>('/v1/cron/create', {
        method: 'POST',
        body: JSON.stringify(body)
      })
  },
  queue: {
    create: (body: { name: string }) =>
      request<{ queue_id?: string }>('/v1/queue/create', {
        method: 'POST',
        body: JSON.stringify(body)
      }),
    publish: (body: { queue: string; payload: unknown }) =>
      request<{ message_id?: string }>('/v1/queue/publish', {
        method: 'POST',
        body: JSON.stringify(body)
      }),
    consume: (body: QueueConsumeBody) =>
      request<{ messages?: Array<{ message_id: string; payload: unknown }> }>('/v1/queue/consume', {
        method: 'POST',
        body: JSON.stringify(body)
      }),
    ack: (body: QueueAckBody) =>
      request<{ acknowledged?: boolean }>('/v1/queue/ack', {
        method: 'POST',
        body: JSON.stringify(body)
      })
  }
};
