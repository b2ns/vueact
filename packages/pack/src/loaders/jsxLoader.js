import { parse } from '../jsxParser.js';
import { genCodeFromAST } from '../utils.js';

export default ({ module: { ast, changeExtension }, createASTNode }, opts) => {
  changeExtension('js');

  let lastImportStatementIndex = 0;
  for (let i = 0; i < ast.length; i++) {
    const node = ast[i];
    if (node.type === 'import') {
      lastImportStatementIndex = i;
    }
  }

  const restNodes = ast.splice(
    lastImportStatementIndex ? lastImportStatementIndex + 1 : 0
  );
  if (restNodes.length) {
    const sourceCode = genCodeFromAST(restNodes);
    const code = parse(sourceCode, opts);
    ast.push(createASTNode('other', code));
  }
};
