/**
 * Local Node entry for the football BFF (no Wrangler required).
 * Run: `npm run bff` with FOOTBALL_API_KEY in the environment.
 */
import { createServer } from 'node:http';

import { handleFootballBffRequest } from '../../lib/footballBff';

const port = Number(process.env.PORT ?? 8787);

const server = createServer((req, res) => {
  void (async () => {
    const host = req.headers.host ?? `127.0.0.1:${port}`;
    const url = `http://${host}${req.url ?? '/'}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(key, value);
      else if (Array.isArray(value)) headers.set(key, value.join(', '));
    }
    const request = new Request(url, { method: req.method, headers });
    const response = await handleFootballBffRequest(request, {
      apiKey: process.env.FOOTBALL_API_KEY ?? '',
    });
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.end(Buffer.from(await response.arrayBuffer()));
  })().catch((err: unknown) => {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ errors: { bff: err instanceof Error ? err.message : 'BFF crashed' } }));
  });
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`KickFeed football BFF http://127.0.0.1:${port}\n`);
});
