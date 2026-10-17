import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Response } from 'express';

interface Client {
  response: Response;
  heartbeat: NodeJS.Timeout;
  lifetime: NodeJS.Timeout;
}

/** 单 PM2 实例内的 SSE 广播器；未来多实例时只需把 publish 接到 Redis Pub/Sub。 */
@Injectable()
export class AnnouncementStreamService implements OnModuleDestroy {
  private readonly clients = new Map<number, Set<Client>>();

  register(userId: number, response: Response): void {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    const client = {} as Client;
    client.response = response;
    client.heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 20_000);
    client.lifetime = setTimeout(() => {
      this.send(client, 'reconnect', { reason: 'connection-lifetime' });
      response.end();
    }, 5 * 60_000);

    const bucket = this.clients.get(userId) ?? new Set<Client>();
    bucket.add(client);
    this.clients.set(userId, bucket);
    this.send(client, 'connected', { at: Date.now() });
    response.on('close', () => this.remove(userId, client));
  }

  broadcast(reason: string): void {
    for (const bucket of this.clients.values()) {
      for (const client of bucket) this.send(client, 'announcement', { reason, at: Date.now() });
    }
  }

  notifyUser(userId: number, reason: string): void {
    for (const client of this.clients.get(userId) ?? []) {
      this.send(client, 'announcement', { reason, at: Date.now() });
    }
  }

  onModuleDestroy(): void {
    for (const [userId, bucket] of this.clients) {
      for (const client of bucket) {
        client.response.end();
        this.remove(userId, client);
      }
    }
  }

  private send(client: Client, event: string, data: unknown): void {
    if (!client.response.writableEnded && !client.response.destroyed) {
      client.response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  }

  private remove(userId: number, client: Client): void {
    clearInterval(client.heartbeat);
    clearTimeout(client.lifetime);
    const bucket = this.clients.get(userId);
    bucket?.delete(client);
    if (!bucket?.size) this.clients.delete(userId);
  }
}
