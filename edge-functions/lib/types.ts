export type EventContext = {
  request: Request;
  params: Record<string, string>;
  env?: Record<string, unknown>;
  next: () => Promise<Response>;
  waitUntil?: (promise: Promise<unknown>) => void;
};
