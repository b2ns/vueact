import { createReadStream, existsSync, statSync } from 'fs';
import { extname, join, resolve } from 'path';

// TODO cache
export default (dir) => {
  dir = resolve(dir || './');
  return (req, res, next) => {
    let pathname = req.URL.pathname;

    if (pathname.indexOf('%') !== -1) {
      pathname = decodeURIComponent(pathname);
    }

    const absPath = join(dir, pathname);

    if (!existsSync(absPath)) {
      next({ statusCode: 404 });
    }

    const stats = statSync(absPath);
    const headers = {
      'Content-Length': stats.size,
      'Content-Type': mimeTypes[extname(absPath).slice(1)],
      'Last-Modified': stats.mtime.toUTCString(),
    };

    for (const key in headers) {
      res.setHeader(key, headers[key]);
    }

    res.writeHead(200, headers);

    createReadStream(absPath).pipe(res);
    // next();
  };
};

// TODO add more mime
const mimeTypes = {
  js: 'application/javascript',
  json: 'application/json',
  css: 'text/css',
  html: 'text/html',
  htm: 'text/html',
  txt: 'text/plain',
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
};
