/** Protocol test harnesses deliberately accept arbitrary server JSON. */
export interface FixtureSocket extends WebSocket {
  waitFor(predicate: (message: any) => boolean, timeoutMs?: number): Promise<any>;
  receiptEvents: Map<string, any[]>;
}
export interface FixtureWaiter {
  predicate: (message: any) => boolean;
  resolve(message: any): void;
  reject(error: unknown): void;
  timer?: ReturnType<typeof setTimeout>;
}
