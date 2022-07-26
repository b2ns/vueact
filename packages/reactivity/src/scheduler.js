import { isArray } from '@vueact/shared';

let isFlushing = false;
let isFlushPending = false;

const queue = [];
let flushIndex = 0;

const pendingPreFlushCbs = [];
let activePreFlushCbs = null;
let preFlushIndex = 0;

const pendingPostFlushCbs = [];
let activePostFlushCbs = null;
let postFlushIndex = 0;

const resolvedPromise = Promise.resolve();
let currentFlushPromise = null;

export function nextTick(fn) {
  const p = currentFlushPromise || resolvedPromise;
  return fn ? p.then(fn) : p;
}

export function queueJob(job) {
  queue.push(job);
  queueFlush();
}

function queueFlush() {
  if (!isFlushing && !isFlushPending) {
    isFlushPending = true;
    currentFlushPromise = resolvedPromise.then(flushJobs);
  }
}

export function queuePreFlushCb(cb) {
  queueCb(cb, activePreFlushCbs, pendingPreFlushCbs, preFlushIndex);
}

export function queuePostFlushCb(cb) {
  queueCb(cb, activePostFlushCbs, pendingPostFlushCbs, postFlushIndex);
}

function queueCb(cb, activeQueue, pendingQueue, index) {
  if (isArray(cb)) {
    pendingQueue.push(...cb);
  } else {
    if (
      !activeQueue ||
      !activeQueue.includes(cb, cb.allowRecurse ? index + 1 : index)
    ) {
      pendingQueue.push(cb);
    }
  }
  queueFlush();
}

function flushJobs() {
  isFlushPending = false;
  isFlushing = true;

  flushPreFlushCbs();

  try {
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex];
      if (job && job.active !== false) {
        job();
      }
    }
  } finally {
    flushIndex = 0;
    queue.length = 0;

    flushPostFlushCbs();

    isFlushing = false;
    currentFlushPromise = null;
  }
}

export function flushPreFlushCbs() {
  if (pendingPreFlushCbs.length) {
    activePreFlushCbs = [...new Set(pendingPreFlushCbs)];
    pendingPreFlushCbs.length = 0;
    for (
      preFlushIndex = 0;
      preFlushIndex < activePreFlushCbs.length;
      preFlushIndex++
    ) {
      activePreFlushCbs[preFlushIndex]();
    }
    activePreFlushCbs = null;
    preFlushIndex = 0;
  }
}

export function flushPostFlushCbs() {
  flushPreFlushCbs();
  if (pendingPostFlushCbs.length) {
    const deduped = [...new Set(pendingPostFlushCbs)];
    pendingPostFlushCbs.length = 0;

    if (activePostFlushCbs) {
      activePostFlushCbs.push(...deduped);
      return;
    }

    activePostFlushCbs = deduped;

    for (
      postFlushIndex = 0;
      postFlushIndex < activePostFlushCbs.length;
      postFlushIndex++
    ) {
      activePostFlushCbs[postFlushIndex]();
    }
    activePostFlushCbs = null;
    postFlushIndex = 0;
  }
}
