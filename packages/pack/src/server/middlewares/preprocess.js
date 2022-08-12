export default () => (req, res, next) => {
  Object.defineProperty(req, 'URL', {
    get() {
      return new URL(req.url, `http://${req.headers.host}`);
    },
  });

  const parsed = req.URL;
  const pathname = parsed.pathname || '/';

  if (pathname === '/') {
    res.writeHead(302, {
      Location: `/index.html${parsed.search}${parsed.hash}`,
    });
    res.end();
    return;
  }

  next();
};
