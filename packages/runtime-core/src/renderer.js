import { EMPTY_OBJ, invokeArrayFns } from '@vueact/shared';
import { isSameVNodeType, isVNode, ShapeFlags, Text } from './vnode.js';
import { flushPostFlushCbs, queueJob, queuePostFlushCb, ReactiveEffect } from '@vueact/reactivity';
import { createComponentInstance, renderComponentRoot, setupComponent, shouldUpdateComponent, updateProps } from './component.js';

export function createRenderer(options) {
  return baseCreateRenderer(options);
}

function baseCreateRenderer({
  insert: hostInsert,
  remove: hostRemove,
  patchProp: hostPatchProp,
  createElement: hostCreateElement,
  createText: hostCreateText,
  // createComment: hostCreateComment,
  setText: hostSetText,
  setElementText: hostSetElementText,
  parentNode: hostParentNode,
  nextSibling: hostNextSibling,
}) {
  const patch = (n1, n2, container, anchor = null, parentComponent = null) => {
    if (n1 === n2) {
      return;
    }

    if (n1 && !isSameVNodeType(n1, n2)) {
      anchor = getNextHostNode(n1);
      unmount(n1, parentComponent);
      n1 = null;
    }

    const { type, shapeFlag } = n2;
    if (type === Text) {
      processText(n1, n2, container, anchor);
    } else if (shapeFlag & ShapeFlags.ELEMENT) {
      processElement(n1, n2, container, anchor, parentComponent);
    } else if (shapeFlag & ShapeFlags.COMPONENT) {
      processComponent(n1, n2, container, anchor, parentComponent);
    }
  };

  const processText = (n1, n2, container, anchor) => {
    if (n1 == null) {
      hostInsert((n2.el = hostCreateText(n2.children)), container, anchor);
    } else {
      const el = (n2.el = n1.el);
      if (n2.children !== n1.children) {
        hostSetText(el, n2.children);
      }
    }
  };

  const processElement = (n1, n2, container, anchor, parentComponent) => {
    if (n1 == null) {
      mountElement(n2, container, anchor, parentComponent);
    } else {
      patchElement(n1, n2, container, parentComponent);
    }
  };
  const mountElement = (vnode, container, anchor, parentComponent) => {
    const { type, props, shapeFlag, children } = vnode;
    const el = (vnode.el = hostCreateElement(type));

    if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
      hostSetElementText(el, children);
    } else if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
      mountChildren(children, el, null, parentComponent);
    }

    if (props) {
      for (const key in props) {
        if (Object.hasOwnProperty.call(props, key)) {
          hostPatchProp(el, key, null, props[key], children, parentComponent, unmountChildren);
        }
      }
    }

    hostInsert(el, container, anchor);
  };
  const mountChildren = (children, container, anchor, parentComponent, start = 0) => {
    for (let i = start; i < children.length; i++) {
      patch(null, children[i], container, anchor, parentComponent);
    }
  };
  const patchElement = (n1, n2, parentComponent) => {
    const el = (n2.el = n1.el);
    const oldProps = n1.props || EMPTY_OBJ;
    const newProps = n2.props || EMPTY_OBJ;
    patchChildren(n1, n2, el, null, parentComponent);
    patchProps(n2, el, oldProps, newProps, parentComponent);
  };
  const patchProps = (vnode, el, oldProps, newProps, parentComponent) => {
    if (oldProps !== newProps) {
      for (const key in newProps) {
        const next = newProps[key];
        const prev = oldProps[key];
        if (next !== prev) {
          hostPatchProp(el, key, prev, next, vnode.children, parentComponent, unmountChildren);
        }
      }
      if (oldProps !== EMPTY_OBJ) {
        for (const key in oldProps) {
          if (!(key in newProps)) {
            hostPatchProp(el, key, oldProps[key], null, vnode.children, parentComponent, unmountChildren);
          }
        }
      }
    }
  };

  const processComponent = (n1, n2, container, anchor, parentComponent) => {
    if (n1 == null) {
      mountComponent(n2, container, anchor, parentComponent);
    } else {
      updateComponent(n1, n2);
    }
  };
  const mountComponent = (initialVNode, container, anchor, parentComponent) => {
    const instance = (initialVNode.component = createComponentInstance(initialVNode, parentComponent));

    setupComponent(instance);

    setupRenderEffect(instance, initialVNode, container, anchor);
  };
  const updateComponent = (n1, n2) => {
    const instance = (n2.component = n1.component);
    if (shouldUpdateComponent(n1, n2)) {
      instance.next = n2;
      instance.update();
    } else {
      n2.el = n1.el;
      instance.vnode = n2;
    }
  };

  const setupRenderEffect = (instance, initialVNode, container, anchor) => {
    const componentUpdateFn = () => {
      if (!instance.isMounted) {
        const { bm, m } = instance;
        const subTree = (instance.subTree = renderComponentRoot(instance));

        bm && invokeArrayFns(bm);

        patch(null, subTree, container, anchor, instance);

        initialVNode.el = subTree.el;

        instance.isMounted = true;

        initialVNode = container = anchor = null;

        if (m) {
          queuePostFlushCb(m);
        }
      } else {
        let { next, vnode, bu, u } = instance;

        if (next) {
          next.el = vnode.el;
          next.component = instance;
          const nextProps = next.props || {};
          const children = next.children;
          instance.vnode = next;
          instance.next = null;
          updateProps(instance, { ...nextProps, children });
        } else {
          next = vnode;
        }

        bu && invokeArrayFns(bu);

        const nextTree = renderComponentRoot(instance);
        const prevTree = instance.subTree;
        instance.subTree = nextTree;

        patch(prevTree, nextTree, hostParentNode(prevTree.el), getNextHostNode(prevTree), instance);

        next.el = nextTree.el;

        if (u) {
          queuePostFlushCb(u);
        }
      }
    };

    const effect = (instance.effect = new ReactiveEffect(componentUpdateFn, () => queueJob(update)));

    const update = (instance.update = () => effect.run());
    update.id = instance.uid;

    update();
  };

  const patchChildren = (n1, n2, container, anchor, parentComponent) => {
    const c1 = n1 && n1.children;
    const prevShapeFlag = n1 ? n1.shapeFlag : 0;
    const c2 = n2.children;

    const { shapeFlag } = n2;

    if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
      if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        unmountChildren(c1, parentComponent);
      }
      if (c2 !== c1) {
        hostSetElementText(container, c2);
      }
    } else {
      if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          // patchKeyedChildren(c1, c2, container, anchor, parentComponent);
          patchUnkeyedChildren(c1, c2, container, anchor, parentComponent);
        } else {
          unmountChildren(c1, parentComponent);
        }
      } else {
        if (prevShapeFlag & ShapeFlags.TEXT_CHILDREN) {
          hostSetElementText(container, '');
        }
        if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          mountChildren(c2, container, anchor, parentComponent);
        }
      }
    }
  };

  const patchUnkeyedChildren = (c1, c2, container, anchor, parentComponent) => {
    c1 = c1 || EMPTY_ARR;
    c2 = c2 || EMPTY_ARR;
    const oldLength = c1.length;
    const newLength = c2.length;
    const commonLength = Math.min(oldLength, newLength);
    let i;
    for (i = 0; i < commonLength; i++) {
      patch(c1[i], c2[i], container, null, parentComponent);
    }
    if (oldLength > newLength) {
      unmountChildren(c1, parentComponent, commonLength);
    } else {
      mountChildren(c2, container, anchor, parentComponent, commonLength);
    }
  };

  const move = (vnode, container, anchor) => {
    const { el, shapeFlag } = vnode;
    if (shapeFlag & ShapeFlags.COMPONENT) {
      move(vnode.component.subTree, container, anchor);
    } else {
      hostInsert(el, container, anchor);
    }
  };

  const unmount = (vnode, parentComponent) => {
    if (!isVNode(vnode)) {
      return;
    }

    const { props, shapeFlag, children } = vnode;

    if (props?.onVnodeBeforeUnmount) {
      props.onVnodeBeforeUnmount();
    }

    if (shapeFlag & ShapeFlags.COMPONENT) {
      unmountComponent(vnode.component);
    } else {
      if (children) {
        unmountChildren(children, parentComponent);
      }
      remove(vnode);
    }
  };

  const remove = (vnode) => {
    hostRemove(vnode.el);
  };

  const unmountComponent = (instance) => {
    const { update, subTree, bum, um } = instance;

    bum && invokeArrayFns(bum);

    if (update) {
      update.active = false;
      unmount(subTree, instance);
    }

    if (um) {
      queuePostFlushCb(um);
    }

    queuePostFlushCb(() => {
      instance.isUnmounted = true;
    });
  };

  const unmountChildren = (children, parentComponent, start = 0) => {
    for (let i = start; i < children.length; i++) {
      unmount(children[i], parentComponent);
    }
  };

  const getNextHostNode = (vnode) => {
    if (vnode.shapeFlag & ShapeFlags.COMPONENT) {
      return getNextHostNode(vnode.component.subTree);
    }
    return hostNextSibling(vnode.anchor || vnode.el);
  };

  const render = (vnode, container) => {
    if (vnode == null) {
      if (container._vnode) {
        unmount(container._vnode, null);
      }
    } else {
      patch(container._vnode || null, vnode, container);
    }
    flushPostFlushCbs();
    container._vnode = vnode;
  };

  return render;
}
