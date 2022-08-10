import { createReadStream, existsSync, statSync } from 'fs';
import { extname, join, resolve } from 'path';
import { MIME_TYPES, isTextType } from '../utils.js';

export default (dir, opts = {}) => {
  dir = resolve(dir || './');

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

    if (!existsSync(absPath)) {
      res.writeHead(404);
      return res.end();
    }

    const stats = statSync(absPath);

    // use browser cache
    const etag = `W/"${stats.size}-${stats.mtime.getTime()}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304);
      return res.end();
    }

    let cacheControl = '';
    if (opts.dev || extname(pathname) === '.html') {
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

    createReadStream(absPath).pipe(res);
  };
};
