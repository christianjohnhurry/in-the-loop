/**
 * @file The local WebSocket server that clients (review-tui) connect to.
 *
 * It listens only on 127.0.0.1, refuses connections that lack the lock file's
 * auth token, and sends each client the latest editor state on connect and
 * every update after. It knows nothing about VS Code, so it can be tested
 * on its own; `extension.ts` feeds it messages.
 */
import {randomBytes, timingSafeEqual} from 'node:crypto';
import type {IncomingMessage} from 'node:http';
import type {AddressInfo} from 'node:net';
import {WebSocket, WebSocketServer} from 'ws';
import {AUTH_HEADER} from './protocol';
import type {ServerMessage} from './protocol';

/** A running local server. */
export interface IdeServer {
  port: number;
  authToken: string;
  /** Records a message as current state and sends it to every client. */
  publish(msg: ServerMessage): void;
  close(): Promise<void>;
}

/**
 * Compares tokens in constant time, so response timing can't leak the token.
 *
 * @param given Value from the request header.
 * @param expected The real token.
 * @return Whether they match.
 */
function tokenMatches(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Starts a WebSocket server on 127.0.0.1 with a random port. Connections
 * without the right auth header, or sent by a browser (Origin set), are
 * refused during the handshake. New clients immediately get the latest
 * message of each type.
 *
 * @return The running server.
 */
export async function startServer(): Promise<IdeServer> {
  const authToken = randomBytes(32).toString('hex');
  const latest = new Map<string, ServerMessage>();
  const wss = new WebSocketServer({
    host: '127.0.0.1',
    port: 0,
    verifyClient: ({req}: {req: IncomingMessage}): boolean =>
      req.headers.origin === undefined &&
      tokenMatches(req.headers[AUTH_HEADER], authToken),
  });
  await new Promise<void>((resolve, reject) => {
    wss.once('listening', resolve);
    wss.once('error', reject);
  });
  wss.on('connection', (ws) => {
    for (const msg of latest.values()) ws.send(JSON.stringify(msg));
  });
  return {
    port: (wss.address() as AddressInfo).port,
    authToken,
    publish(msg: ServerMessage): void {
      latest.set(msg.type, msg);
      const data = JSON.stringify(msg);
      for (const ws of wss.clients) {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      }
    },
    close: (): Promise<void> =>
      new Promise<void>((resolve) => {
        for (const ws of wss.clients) ws.terminate();
        wss.close(() => resolve());
      }),
  };
}
