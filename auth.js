import { runMutation, runQuery, isConnected, initConvex } from "./convex-client.js";

export const AUTH_STATES = {
  LOADING: "loading",
  LOGGED_OUT: "logged_out",
  LOGGED_IN: "logged_in",
  ONBOARDING: "onboarding",
  OFFLINE: "offline",
};

const TOKEN_KEY = "dailywins_token";

let authState = AUTH_STATES.LOADING;
let currentUser = null;
let convexInitialized = false;
const authListeners = [];

export function onAuthChange(callback) {
  authListeners.push(callback);
  callback(authState, currentUser);
  return () => {
    const index = authListeners.indexOf(callback);
    if (index > -1) authListeners.splice(index, 1);
  };
}

function notifyAuthChange() {
  authListeners.forEach((cb) => cb(authState, currentUser));
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function storeToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function initAuth() {
  if (convexInitialized) return isConnected();
  
  const success = await initConvex();
  convexInitialized = true;
  return success;
}

export async function checkAuth() {
  // Initialize Convex if not already done
  if (!convexInitialized) {
    await initAuth();
  }
  
  // Check if Convex is connected
  if (!isConnected()) {
    console.warn('Convex not connected, using offline mode');
    authState = AUTH_STATES.OFFLINE;
    currentUser = null;
    notifyAuthChange();
    return { state: authState, user: null };
  }
  
  const token = getStoredToken();
  
  if (!token) {
    authState = AUTH_STATES.LOGGED_OUT;
    currentUser = null;
    notifyAuthChange();
    return { state: authState, user: null };
  }
  
  try {
    const user = await runQuery("auth.verifyToken", { token });
    
    if (user) {
      currentUser = user;
      authState = user.onboardingComplete 
        ? AUTH_STATES.LOGGED_IN 
        : AUTH_STATES.ONBOARDING;
    } else {
      storeToken(null);
      currentUser = null;
      authState = AUTH_STATES.LOGGED_OUT;
    }
  } catch (error) {
    console.error("Auth check failed:", error);
    storeToken(null);
    currentUser = null;
    authState = AUTH_STATES.OFFLINE;
  }
  
  notifyAuthChange();
  return { state: authState, user: currentUser };
}

export async function signUp(email, password, name) {
  if (!isConnected()) {
    return { success: false, message: "Cannot connect to server. Please check your internet connection." };
  }
  
  try {
    const result = await runMutation("auth.signUp", { email, password, name });
    
    if (result.success) {
      storeToken(result.token);
      currentUser = { _id: result.userId, email, name, onboardingComplete: false };
      authState = AUTH_STATES.ONBOARDING;
      notifyAuthChange();
    }
    
    return result;
  } catch (error) {
    return { success: false, message: error.message || "Sign up failed" };
  }
}

export async function logIn(email, password) {
  if (!isConnected()) {
    return { success: false, message: "Cannot connect to server. Please check your internet connection." };
  }
  
  try {
    const result = await runMutation("auth.logIn", { email, password });
    
    if (result.success) {
      storeToken(result.token);
      
      const user = await runQuery("auth.verifyToken", { token: result.token });
      
      if (user) {
        currentUser = user;
        authState = user.onboardingComplete 
          ? AUTH_STATES.LOGGED_IN 
          : AUTH_STATES.ONBOARDING;
        notifyAuthChange();
      }
    }
    
    return result;
  } catch (error) {
    return { success: false, message: error.message || "Login failed" };
  }
}

export async function logOut() {
  const token = getStoredToken();
  
  if (token && isConnected()) {
    try {
      await runMutation("auth.logOut", { token });
    } catch (e) {
      console.error("Logout error:", e);
    }
  }
  
  storeToken(null);
  currentUser = null;
  authState = AUTH_STATES.LOGGED_OUT;
  notifyAuthChange();
  return { success: true };
}

export async function checkEmailExists(email) {
  if (!isConnected()) {
    return false;
  }
  
  try {
    return await runQuery("auth.checkEmailExists", { email });
  } catch (error) {
    return false;
  }
}

export function isLoggedIn() {
  return authState === AUTH_STATES.LOGGED_IN || authState === AUTH_STATES.ONBOARDING;
}

export function getCurrentUser() {
  return currentUser;
}

export function getAuthState() {
  return authState;
}
