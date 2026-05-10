/**
 * Minimal Single Source of Truth store with debounced localStorage persistence.
 * - API: getState(), dispatch(action), subscribe(listener), flush()
 * - Persists to localStorage with debounce (default 500ms)
 * - Exports a ready-to-use singleton `store` and `createStore` for tests/DI
 */

const DEFAULT_STORAGE_KEY = 'digest:state:v1';
const DEFAULT_PERSIST_DEBOUNCE_MS = 500;
const DEFAULT_PERSIST_MODE = 'direct'; // 'direct' | 'idle'

const DEFAULT_STATE = {
  version: 1,
  ui: {
    loading: false,
    busy: false,
    lastError: null
  },
  currentNodeId: null,
  nodes: [], // { id, title, content, meta }
  history: [], // snapshots for undo/inspection
  agent: { sessions: {}, traces: [] },
  meta: {}
};

function safeClone(obj) {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

function getStorage() {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function loadFromStorage(storageKey) {
  try {
    const storage = getStorage();
    if (!storage) return null;
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (e) {
    console.warn('store: failed to load state from localStorage', e);
    return null;
  }
}

function defaultReducer(state, action) {
  if (!action || typeof action.type !== 'string') return state;
  switch (action.type) {
    case 'MERGE_STATE':
      return Object.assign({}, state, action.payload || {});
    case 'SET_UI':
      return Object.assign({}, state, { ui: Object.assign({}, state.ui, action.payload) });
    case 'SET_CURRENT_NODE':
      return Object.assign({}, state, { currentNodeId: action.payload });
    case 'ADD_NODE': {
      const nodes = state.nodes.concat([action.payload]);
      return Object.assign({}, state, { nodes });
    }
    case 'UPDATE_NODE': {
      const nodes = state.nodes.map(n => (n.id === action.payload.id ? Object.assign({}, n, action.payload) : n));
      return Object.assign({}, state, { nodes });
    }
    case 'REMOVE_NODE': {
      const nodes = state.nodes.filter(n => n.id !== action.payload);
      return Object.assign({}, state, { nodes });
    }
    case 'PUSH_HISTORY': {
      const history = state.history.concat([action.payload]);
      return Object.assign({}, state, { history });
    }
    case 'RESET':
      return Object.assign({}, safeClone(DEFAULT_STATE), { version: state.version || DEFAULT_STATE.version });
    default:
      return state;
  }
}

export function createStore({
  initialState = DEFAULT_STATE,
  reducer = defaultReducer,
  storageKey = DEFAULT_STORAGE_KEY,
  persistDebounceMs = DEFAULT_PERSIST_DEBOUNCE_MS,
  persistMode = DEFAULT_PERSIST_MODE
} = {}) {
  let state = loadFromStorage(storageKey) || safeClone(initialState);
  let currentReducer = reducer;

  const listeners = new Set();
  let persistTimer = null;
  let pendingPersist = false;

  function schedulePersist() {
    pendingPersist = true;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => flushPersist(), persistDebounceMs);
  }

  function flushPersist() {
    if (!pendingPersist) return;
    try {
      const writeNow = () => {
        try {
          const storage = getStorage();
          if (!storage) {
            pendingPersist = false;
            return;
          }
          storage.setItem(storageKey, JSON.stringify(state));
          pendingPersist = false;
        } catch (e) {
          console.error('store: failed to persist state', e);
        }
      };

      // Default mode is deterministic: flush exactly after debounce window.
      if (persistMode === 'idle') {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(writeNow, { timeout: 200 });
        } else {
          writeNow();
        }
      } else {
        writeNow();
      }
    } finally {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
    }
  }

  // ensure pending persist flush on unload
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('beforeunload', () => {
      if (persistTimer) clearTimeout(persistTimer);
      try {
        const storage = getStorage();
        if (pendingPersist && storage) storage.setItem(storageKey, JSON.stringify(state));
      } catch (e) {
        // swallow - best effort
      }
    });
  }

  function getState() {
    return safeClone(state);
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    listeners.add(listener);
    // return unsubscribe
    return () => listeners.delete(listener);
  }

  function dispatch(action) {
    try {
      const next = currentReducer(state, action);
      if (next === state) return state;
      state = next;
      // notify listeners with a cloned state to avoid accidental mutation
      const snapshot = safeClone(state);
      listeners.forEach((l) => {
        try {
          l(snapshot, action);
        } catch (err) {
          console.error('store listener error', err);
        }
      });
      schedulePersist();
      return state;
    } catch (e) {
      console.error('store dispatch error', e);
      throw e;
    }
  }

  function replaceReducer(nextReducer) {
    if (typeof nextReducer !== 'function') throw new TypeError('nextReducer must be a function');
    currentReducer = nextReducer;
  }

  return {
    getState,
    dispatch,
    subscribe,
    flush: flushPersist,
    replaceReducer
  };
}

// default singleton store for quick integration; projects may call createStore for DI/testing
export const store = createStore();
export default store;
