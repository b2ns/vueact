import { escape, handleQuotedCode, isComment, isQuote, handleCommentCode } from './utils.js';

const Text = Symbol('text');
const Dynamic = Symbol('dynamic');
const SpreadProps = Symbol('spread props');
const MSG = 'Compile Error:';

export function compileJSX(sourceCode, index) {
  let tagNameFlag = false;
  let tagName = '';

  let tagNameEndFlag = false;
  let tagNameEnd = '';

  let propNameFlag = false;
  let propName = '';

  let propValFlag = false;
  let propVal = '';

  let dynamicFlag = false;
  let dynamicVal = '';
  let dynamicCurlyStack = [];

  let textFlag = false;
  let textVal = '';
  let blankFlag = false;

  const root = [];
  let currentStack = root;

  const isRoot = () => currentStack === root;

  const setChildStack = () => {
    const currentTag = getCurrentTag();
    const stack = [];
    stack.parent = currentStack;
    return (currentStack = currentTag.children = stack);
  };

  const backToParentStack = () => {
    currentStack = currentStack.parent;
  };

  const pushTag = (...args) => currentStack.push(...args);

  const getCurrentTag = () => (currentStack.length > 0 ? currentStack[currentStack.length - 1] : null);

  let i = index;
  for (; i < sourceCode.length; i++) {
    const char = sourceCode[i];
    const nextChar = sourceCode[i + 1] || '';
    const isBlank = /\s/.test(char);

    if (tagNameFlag) {
      if (isBlank || char === '>' || char === '/') {
        pushTag({ type: tagName });

        tagName = '';
        tagNameFlag = false;

        if (char === '>') {
          blankFlag = false;
          setChildStack();
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
        if (isRoot()) {
          i++;
          break;
        }

        if (tagNameEnd) {
          backToParentStack();

          if (tagNameEnd !== getCurrentTag().type) {
            throw new Error(`${MSG} tag not match`);
          }

          if (isRoot()) {
            i++;
            break;
          }
        }

        tagNameEndFlag = false;
        tagNameEnd = '';
      } else {
        tagNameEnd += char;
      }

      continue;
    }

    if (propNameFlag) {
      if (isBlank) {
        if (propName) {
          const currentTag = getCurrentTag();
          if (!currentTag.props) {
            currentTag.props = '';
          }
          currentTag.props += `,${propName}: ""`;
          propName = '';
        }
      } else if (char === '=') {
        if (nextChar === '"') {
          propNameFlag = false;
          propValFlag = true;
          i++;
        } else if (nextChar === '{') {
          propNameFlag = false;
          dynamicFlag = true;
          i++;
        } else {
          throw new Error(`${MSG}`);
        }
      } else if (char === '>') {
        propNameFlag = false;
        propName = '';
        setChildStack();
      } else if (char === '{') {
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
      if (isComment(char, nextChar)) {
        const [_, nextIndex] = handleCommentCode(sourceCode, i);
        i = nextIndex - 1;
      } else if (isQuote(char)) {
        const [quotedCode, nextIndex] = handleQuotedCode(sourceCode, i);
        dynamicVal += quotedCode;
        i = nextIndex - 1;
      } else if (isJSX(char, nextChar)) {
        const [jsxCode, nextIndex] = compileJSX(sourceCode, i);
        dynamicVal += jsxCode;
        i = nextIndex - 1;
      } else if (char === '}') {
        if (dynamicCurlyStack.length === 0) {
          if (propName) {
            const currentTag = getCurrentTag();
            if (!currentTag.props) {
              currentTag.props = '';
            }

            if (propName === SpreadProps) {
              currentTag.props += `,${dynamicVal}`;
            } else {
              currentTag.props += `,${propName}: ${dynamicVal}`;
            }

            propName = '';
            propNameFlag = true;
          } else {
            pushTag({ type: Dynamic, value: dynamicVal });
          }
          dynamicFlag = false;
          dynamicVal = '';
          blankFlag = false;
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
      if (char === '"') {
        const currentTag = getCurrentTag();
        if (!currentTag.props) {
          currentTag.props = '';
        }
        currentTag.props += `,${propName}: "${propVal}"`;

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
      if (nextChar === '/') {
        tagNameEndFlag = true;
        i++;
      } else {
        tagNameFlag = true;
      }

      if (textFlag && textVal) {
        if (blankFlag) {
          textVal += ' ';
          blankFlag = false;
        }
        pushTag({ type: Text, value: textVal });
      }
      textVal = '';
      textFlag = false;

      continue;
    }

    if (!isBlank) {
      if (char === '{') {
        dynamicFlag = true;

        if (textFlag && textVal) {
          if (blankFlag) {
            textVal += ' ';
            blankFlag = false;
          }
          pushTag({ type: Text, value: textVal });
        }
        textFlag = false;
        textVal = '';
      } else {
        textFlag = true;
        if (blankFlag) {
          textVal += ' ';
          blankFlag = false;
        }
        textVal += char;
      }

      continue;
    } else {
      blankFlag = true;
    }
  }

  return [genCode(root), i];
}

export const isJSX = (char, nextChar) => char === '<' && /[a-z_]/i.test(nextChar);

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
      type = /^[A-Z]\w+/.test(type) ? type : `'${type}'`;
      props = props ? `{${props.slice(1)}}` : 'null';
      const childCode = children ? genCode(children) : '';
      code += `,h(${type}, ${props}${childCode ? ' ,' + childCode : ''})`;
    }
  }
  code = code.slice(1);
  code = nodes.length > 1 ? `[${code}]` : code;
  return code;
}
