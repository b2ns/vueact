import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { MIME_TYPES, isTextType } from '../utils.js';

export default (dir, opts = {}) => {
  dir = resolve(dir || './');
  const { dev, memfs } = opts;
  const CACHE = new Map();

  return (req, res, next) => {
    const { method } = req;
    if (method !== 'GET' && method !== 'HEAD') {
      return next();
    }

    const paredURL = req.URL;
    let pathname = paredURL.pathname;

    if (pathname.includes('%')) {
      pathname = decodeURIComponent(pathname);
    }

    const absPath = join(dir, pathname);

    if (memfs ? !memfs.exists(absPath) : !existsSync(absPath)) {
      res.writeHead(404);
      return res.end();
    }

    let stats = null;
    if (dev) {
      if (memfs) {
        stats = memfs.stat(absPath);
      } else {
        stats = statSync(absPath);
      }
    } else {
      stats = CACHE.get(absPath);
      if (!stats) {
        stats = statSync(absPath);
        CACHE.set(absPath, stats);
      }
    }

    // use browser cache
    const etag = `W/"${stats.size}-${stats.mtime.getTime()}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304);
      return res.end();
    }

    let cacheControl = '';
    if (dev || extname(pathname) === '.html') {
      cacheControl = 'no-cache';
    } else {
      // we use content hash in url to do cache busting
      cacheControl = `max-age=31536000,immutable`;
    }

    let mimeType =
      MIME_TYPES[extname(absPath).slice(1)] || 'application/octet-stream';
    if (isTextType(mimeType)) mimeType += ';charset=utf-8';

    const headers = {
      'Content-Length': stats.size,
      'Content-Type': mimeType,
      'Cache-Control': cacheControl,
      'Last-Modified': stats.mtime.toUTCString(),
      ETag: etag,
    };

    for (const key in headers) {
      res.setHeader(key, headers[key]);
    }

    res.writeHead(200);

    if (memfs) {
      res.end(memfs.read(absPath));
    } else {
      createReadStream(absPath).pipe(res);
    }
  };
};
