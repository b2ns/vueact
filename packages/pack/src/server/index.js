import { createServer } from 'http';
import { isUndef } from '../utils.js';
import preprocessMiddleware from './middlewares/preprocess.js';
import staticAssets from './middlewares/staticAssets.js';

const HOST = 'localhost';
const PORT = 8080;

export default class PackServer {
  constructor(config = {}) {
    this.config = config;
    this.middlewares = [];
    this.httpServer = createServer();

    this.init();
  }

  static createServer(config) {
    return new this(config);
  }

  init() {
    const { root = process.cwd() } = this.config;

    this.use(preprocessMiddleware()).use(staticAssets(root));

    this.httpServer.on('request', createRequestListener(this.middlewares));

    this.httpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        this.listen(err.port + 1);
        return;
      }
      console.error(err);
    });

    this.httpServer.once('listening', () => {
      const { address, port } = this.httpServer.address();
      console.log(`
listening ...
  http://${address}:${port}
`);
    });
  }

  use(route, handler) {
    if (isUndef(handler)) {
      handler = route;
      route = '/';
    }
    this.middlewares.push({ route, handler });
    return this;
  }

  listen(port = PORT, host = HOST) {
    this.httpServer.listen(port, host);
  }
}

function createRequestListener(middlewares) {
  return (req, res) => {
    let index = 0;

    const next = (err) => {
      const middleware = middlewares[index++];
      if (!middleware) {
        done(err, req, res);
        return;
      }

      const path = req.path || '/';
      const { route, handler } = middleware;

      if (path.slice(0, route.length) !== route) {
        return next(err);
      }

      try {
        if (err && handler.length === 4) {
          handler(err, req, res, next);
          return;
        } else if (!err && handler.length < 4) {
          handler(req, res, next);
          return;
        }
      } catch (error) {
        err = error;
      }
      next(err);
    };

    next();
  };
}

function done(err, req, res) {
  let headers = null;
  let status = '';
  let msg = '';

  if (res.headersSent) {
    return;
  }

  if (err) {
    headers = err.headers;
    status = err.status || err.statusCode || res.statusCode;
    msg = status;
  } else {
    status = 404;
    msg = 'Not Found';
  }

  const body = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Error</title>
  </head>
  <body>
    <pre>${msg}</pre>
  </body>
</html>`;

  res.statusCode = status;
  res.statusMessage = msg;

  res.removeHeader('Content-Encoding');
  res.removeHeader('Content-Language');
  res.removeHeader('Content-Range');

  if (headers) {
    for (const key in headers) {
      res.setHeader(key, headers[key]);
    }
  }

  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'));

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  res.end(body, 'utf8');
}
