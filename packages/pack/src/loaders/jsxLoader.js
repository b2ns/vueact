import { compile } from '../compileJSX.js';
import { genCodeFromAST } from '../utils.js';

export default ({ ast, changeExtension }) => {
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
    const code = compile(sourceCode);
    ast.push({ code });
  }
};
