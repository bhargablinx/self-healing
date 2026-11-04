import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 4000);
const server = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Self-Healing Software demo service is running.\n');
    return;
  }

  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));
});

server.listen(port, '0.0.0.0', () => {
  console.info(`Demo service listening on port ${port}`);
});
