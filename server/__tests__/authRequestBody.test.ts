import http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { requireAppAuthentication } from '../auth';

const openServers = new Set<http.Server>();

afterEach(async () => {
  await Promise.all([...openServers].map((server) => new Promise<void>((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve());
  })));
  openServers.clear();
});

describe('authentication request-body handling', () => {
  it('drains an unauthenticated note-image upload before returning 401', async () => {
    const app = express();
    app.use('/api', requireAppAuthentication);
    app.post('/api/note-images', (_req, res) => res.sendStatus(204));

    const server = app.listen(0);
    openServers.add(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP test server');

    let responseStarted = false;
    let client: http.ClientRequest;
    const response = new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
      client = http.request({
        host: '127.0.0.1',
        port: address.port,
        path: '/api/note-images',
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data; boundary=probe',
          'Content-Length': '2',
        },
      }, (incoming) => {
        responseStarted = true;
        let body = '';
        incoming.setEncoding('utf8');
        incoming.on('data', (chunk) => { body += chunk; });
        incoming.on('end', () => resolve({ status: incoming.statusCode, body }));
      });
      client.on('error', reject);
      client.write('a');
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(responseStarted).toBe(false);
    client!.end('b');

    const result = await response;
    expect(result.status).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: { message: 'AUTH_TOKEN_REQUIRED' } });
  });
});
