// Convex client setup using CDN bundle
const CONVEX_URL = "https://perfect-chicken-357.eu-west-1.convex.cloud";

// Wait for Convex to load from CDN
let convex = null;
let api = null;
let connectionFailed = false;

function waitForConvex() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Convex CDN load timeout'));
    }, 10000);
    
    function check() {
      if (window.Convex) {
        clearTimeout(timeout);
        resolve();
      } else {
        setTimeout(check, 100);
      }
    }
    check();
  });
}

async function initConvex() {
  try {
    await waitForConvex();
    convex = new window.Convex.ConvexClient(CONVEX_URL);
    api = window.Convex.api;
    console.log('Convex connected successfully');
    return true;
  } catch (err) {
    console.error('Convex initialization failed:', err);
    connectionFailed = true;
    return false;
  }
}

export { convex, api, initConvex, isConnected: () => !connectionFailed && convex !== null };

export const subscriptions = new Map();

export function subscribe(queryPath, args, callback) {
  if (!convex || !api) {
    console.warn('Convex not connected, skipping subscription');
    callback(null);
    return () => {};
  }
  
  const [module, func] = queryPath.split(".");
  const key = JSON.stringify({ queryPath, args });
  
  if (subscriptions.has(key)) {
    subscriptions.get(key).unsubscribe();
  }
  
  const query = api[module]?.[func];
  if (!query) {
    console.error(`Query ${queryPath} not found`);
    return () => {};
  }
  
  try {
    const subscription = convex.onUpdate(query, args || {}, (result) => {
      callback(result);
    });
    
    subscriptions.set(key, subscription);
    
    return () => {
      subscription.unsubscribe();
      subscriptions.delete(key);
    };
  } catch (err) {
    console.error('Subscription failed:', err);
    callback(null);
    return () => {};
  }
}

export async function runMutation(mutationPath, args) {
  if (!convex || !api) {
    throw new Error('Convex not connected');
  }
  
  const [module, func] = mutationPath.split(".");
  const mutation = api[module]?.[func];
  if (!mutation) {
    throw new Error(`Mutation ${mutationPath} not found`);
  }
  return convex.mutation(mutation, args || {});
}

export async function runQuery(queryPath, args) {
  if (!convex || !api) {
    throw new Error('Convex not connected');
  }
  
  const [module, func] = queryPath.split(".");
  const query = api[module]?.[func];
  if (!query) {
    throw new Error(`Query ${queryPath} not found`);
  }
  return convex.query(query, args || {});
}

export function cleanup() {
  for (const [key, sub] of subscriptions) {
    try {
      sub.unsubscribe();
    } catch (e) {}
  }
  subscriptions.clear();
  if (convex) {
    try {
      convex.close();
    } catch (e) {}
  }
}

window.addEventListener("beforeunload", cleanup);
