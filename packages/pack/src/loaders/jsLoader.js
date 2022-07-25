import { extname } from 'path';

export default ({ ast }) => {
  for (const node of ast) {
    if (node.type === 'import') {
      const { pathname, code } = node;
      const ext = extname(pathname);
      // App -> App.js
      // App.jsx -> App.js
      if (!ext) {
        node.pathname = `${pathname}.js`;
      } else if (['.jsx', '.ts', '.tsx', '.mjs'].includes(ext)) {
        node.pathname = pathname.replace(ext, '.js');
      } else {
        continue;
      }
      node.code = code.replace(pathname, node.pathname);
    }
  }
};
