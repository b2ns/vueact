import { escape, handleCommentCode, handleQuotedCode, isComment, isQuote } from './utils.js';

export function compile(sourceCode) {
  let code = '';
  let i = 0;
  while (i < sourceCode.length) {
    const char = sourceCode[i];
    const nextChar = sourceCode[i + 1];

    if (isComment(char, nextChar)) {
      const [commentCode, nextIndex] = handleCommentCode(sourceCode, i);
      code += commentCode;
      i = nextIndex;
      continue;
    }

    if (isQuote(char)) {
      const [quotedCode, nextIndex] = handleQuotedCode(sourceCode, i);
      code += quotedCode;
      i = nextIndex;
      continue;
    }

    if (isJSX(sourceCode, i)) {
      const [jsxCode, nextIndex] = compileJSX(sourceCode, i);
      code += jsxCode;
      i = nextIndex;
      continue;
    }

    code += char;
    i++;
  }

  return code;
}

const Text = Symbol('text node');
const Dynamic = Symbol('dynamic node');
const SpreadProps = Symbol('spread props');

const MSG = 'JSX parse error';

export function compileJSX(sourceCode, index) {
  let tagNameFlag = false;
  let tagName = '';

  let tagNameEndFlag = false;
  let tagNameEnd = '';

  let propNameFlag = false;
  let propName = '';

  let propValFlag = false;
  let propVal = '';
  let propValQuote = '"';

  let dynamicFlag = false;
  let dynamicVal = '';
  const dynamicCurlyStack = [];

  let blankFlag = false;
  let textVal = '';

  const ast = [];
  let container = ast;

  const isRoot = () => container === ast;

  const gotoChildContainer = () => {
    const currentNode = getCurrentNode();
    currentNode.children.parent = container;
    container = currentNode.children;
  };

  const backtoParentContainer = () => {
    container = container.parent;
  };

  const pushNode = (node) => {
    container.push(node);
  };

  const getCurrentNode = () => container[container.length - 1] || null;

  const createTagNode = (type) => ({
    type,
    props: '',
    children: [],
  });

  const createTextNode = (value = '') => ({
    type: Text,
    value,
  });

  const createDynamicNode = (value = '') => ({
    type: Dynamic,
    value,
  });

  const handleText = () => {
    if (textVal) {
      if (blankFlag) {
        textVal += ' ';
      }
      pushNode(createTextNode(textVal));
      textVal = '';
    }
    blankFlag = false;
  };

  let i = index;
  for (; i < sourceCode.length; i++) {
    const char = sourceCode[i];
    const prevChar = sourceCode[i - 1];
    const nextChar = sourceCode[i + 1];
    const isBlank = /\s/.test(char);

    if (tagNameFlag) {
      if (isBlank || char === '>' || char === '/') {
        pushNode(createTagNode(tagName));

        tagName = '';
        tagNameFlag = false;

        if (char === '>') {
          gotoChildContainer();
        } else if (char === '/') {
          tagNameEndFlag = true;
        } else {
          propNameFlag = true;
        }
      } else {
        tagName += char;
      }

      continue;
    }

    if (tagNameEndFlag) {
      if (char === '>') {
        tagNameEndFlag = false;
        // empty tag: <input />
        if (!tagNameEnd) {
          if (isRoot()) {
            i++;
            break;
          }
        } else {
          // normal tag: <div></div>
          backtoParentContainer();
          const node = getCurrentNode();

          if (node && tagNameEnd !== node.type) {
            throw new Error(`${MSG}: tag not match <${node.type}></${tagNameEnd}>`);
          }

          tagNameEnd = '';

          if (isRoot()) {
            i++;
            break;
          }
        }
      } else {
        tagNameEnd += char;
      }

      continue;
    }

    if (propNameFlag) {
      if (isBlank) {
        // for boolean attribute: draggable, multiple, disabled
        if (propName) {
          const node = getCurrentNode();
          node.props += `,${propName}: ''`;
          propName = '';
        }
      } else if (char === '=') {
        if (nextChar === '"' || nextChar === "'") {
          propValQuote = nextChar;
          propNameFlag = false;
          propValFlag = true;
          i++;
        } else if (nextChar === '{') {
          propNameFlag = false;
          dynamicFlag = true;
          i++;
        } else {
          throw new Error(`${MSG}: attribute value shoule be quoted`);
        }
      } else if (char === '>') {
        propNameFlag = false;
        propName = '';
        gotoChildContainer();
      } else if (char === '{') {
        // <div {...props}></div>
        dynamicFlag = true;
        propNameFlag = false;
        propName = SpreadProps;
      } else if (char === '/') {
        tagNameEndFlag = true;
        propNameFlag = false;
        propName = '';
      } else {
        propName += char;
      }

      continue;
    }

    if (dynamicFlag) {
      // remove comments
      if (isComment(char, nextChar)) {
        const [_, nextIndex] = handleCommentCode(sourceCode, i);
        i = nextIndex - 1;
      } else if (isQuote(char)) {
        const [quotedCode, nextIndex] = handleQuotedCode(sourceCode, i);
        dynamicVal += quotedCode;
        i = nextIndex - 1;
      } else if (isJSX(sourceCode, i)) {
        const [jsxCode, nextIndex] = compileJSX(sourceCode, i);
        dynamicVal += jsxCode;
        i = nextIndex - 1;
      } else if (char === '}') {
        if (dynamicCurlyStack.length === 0) {
          // dynamic in attribute
          if (propName) {
            const node = getCurrentNode();
            if (propName === SpreadProps) {
              node.props += `,${dynamicVal}`;
            } else {
              node.props += `,${propName}:${dynamicVal}`;
            }

            propName = '';
            propNameFlag = true;
          } else {
            // dynamic in child
            pushNode(createDynamicNode(dynamicVal));
          }
          dynamicFlag = false;
          dynamicVal = '';
        } else {
          dynamicVal += char;
          dynamicCurlyStack.pop();
        }
      } else {
        dynamicVal += char;
        if (char === '{') {
          dynamicCurlyStack.push(1);
        }
      }

      continue;
    }

    if (propValFlag) {
      if (char === propValQuote && prevChar !== '\\') {
        const node = getCurrentNode();
        node.props += `,${propName}:"${propVal}"`;

        propName = '';
        propVal = '';
        propValFlag = false;
        propNameFlag = true;
      } else {
        propVal += char;
      }

      continue;
    }

    if (char === '<') {
      handleText();
      if (nextChar === '/') {
        tagNameEndFlag = true;
        i++;
      } else {
        tagNameFlag = true;
      }
      continue;
    }

    if (char === '{') {
      handleText();
      dynamicFlag = true;
      continue;
    }

    if (isBlank) {
      blankFlag = true;
      continue;
    }

    if (blankFlag) {
      blankFlag = false;
      textVal += ' ';
    }

    textVal += char;
  }

  return [genCode(ast), i];
}

export function isJSX(sourceCode, i) {
  const char = sourceCode[i];
  const nextChar = sourceCode[i + 1];
  if (char === '<' && /[a-z_]/i.test(nextChar)) {
    // fix: when use '<' as less-than sign
    for (let j = i - 1; j >= 0; j--) {
      const ch = sourceCode[j];
      if (/\s/.test(ch)) {
        continue;
      }

      // special case: return <div
      if (
        ch === 'n' &&
        sourceCode[j - 1] === 'r' &&
        sourceCode[j - 2] === 'u' &&
        sourceCode[j - 3] === 't' &&
        sourceCode[j - 4] === 'e' &&
        sourceCode[j - 5] === 'r'
      ) {
        return true;
      }

      // 2 <div
      // _varname <div
      // invoke() <div
      if (/[\w)]/.test(ch)) {
        return false;
      }

      return true;
    }
  }
  return false;
}

function genCode(nodes) {
  let code = '';
  for (const node of nodes) {
    let { type, props, children, value } = node;
    if (type === Text) {
      if (value) {
        code += `,"${escape(value, '"')}"`;
      }
    } else if (type === Dynamic) {
      if (value && value.trim()) {
        code += `,${value}`;
      }
    } else {
      // capitalized tag as custom component
      type = /^[A-Z]\w+/.test(type) ? type : `'${type}'`;
      props = props ? `{${props.slice(1)}}` : 'null';
      const childCode = children && children.length ? genCode(children) : '';
      code += `,h(${type},${props}${childCode ? ',' + childCode : ''})`;
    }
  }
  // remvoe prefix ','
  code = code.slice(1);

  code = nodes.length > 1 ? `[${code}]` : code;

  return code;
}
