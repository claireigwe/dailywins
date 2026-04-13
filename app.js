// ════════════════════════════════════
//  CONVEX CLIENT (CDN-based)
// ════════════════════════════════════

console.log('app.js is loading...');

const CONVEX_URL = "https://knowing-pig-683.eu-west-1.convex.cloud";

let convexClient = null;
let api = null;
let connectionFailed = false;

function waitForConvex() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Convex CDN load timeout'));
    }, 5000);
    
    function check() {
      if (window.convex && window.convex.ConvexClient) {
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
    convexClient = new window.convex.ConvexClient(CONVEX_URL);
    api = window.convex.anyApi;
    console.log('Convex connected successfully');
    console.log('[Convex] API modules:', Object.keys(api || {}));
    return true;
  } catch (err) {
    console.error('Convex initialization failed:', err);
    connectionFailed = true;
    return false;
  }
}

function isConnected() {
  return !connectionFailed && convexClient !== null;
}

// ════════════════════════════════════
//  AUTH STATE
// ════════════════════════════════════

const AUTH_STATES = {
  LOADING: "loading",
  LOGGED_OUT: "logged_out",
  LOGGED_IN: "logged_in",
  ONBOARDING: "onboarding",
  OFFLINE: "offline",
};

const TOKEN_KEY = "dailywins_token";
const LOGGED_IN_KEY = "dailywins_logged_in";

let authState = AUTH_STATES.LOADING;
let currentUser = null;
let convexInitialized = false;
const authListeners = [];

function onAuthChange(callback) {
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

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function storeToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(LOGGED_IN_KEY, 'true');
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LOGGED_IN_KEY);
  }
}

async function initAuth() {
  if (convexInitialized && isConnected()) return true;
  if (convexInitialized && !isConnected()) {
    // Already tried and failed, try again
    convexInitialized = false;
    connectionFailed = false;
    convexClient = null;
    api = null;
  }
  const success = await initConvex();
  convexInitialized = true;
  return success;
}

async function runMutation(mutationPath, args) {
  // Wait for Convex to be ready
  if (!convexInitialized) {
    await initAuth();
  }
  if (!convexClient || !api) throw new Error('Convex not connected');
  const [module, func] = mutationPath.split(".");
  console.log('[runMutation] module:', module, 'func:', func);
  console.log('[runMutation] api keys:', Object.keys(api || {}));
  const mutation = api[module]?.[func];
  if (!mutation) {
    console.error('[runMutation] Mutation not found:', mutationPath);
    console.error('[runMutation] api[module]:', api[module]);
    throw new Error(`Mutation ${mutationPath} not found`);
  }
  console.log('[runMutation] Found mutation:', mutation);
  return convexClient.mutation(mutation, args || {});
}

// Expose to window for use in index.html
window.runMutation = runMutation;
window.runQuery = runQuery;

async function runQuery(queryPath, args) {
  // Wait for Convex to be ready
  if (!convexInitialized) {
    await initAuth();
  }
  if (!convexClient || !api) throw new Error('Convex not connected');
  const [module, func] = queryPath.split(".");
  const query = api[module]?.[func];
  if (!query) {
    console.error('[runQuery] Query not found:', queryPath);
    console.error('[runQuery] api[module]:', api[module]);
    throw new Error(`Query ${queryPath} not found`);
  }
  return convexClient.query(query, args || {});
}

async function ensureHabitsInConvex(token) {
  try {
    console.log('[ensureHabitsInConvex] Starting, token exists:', !!token);
    console.log('[ensureHabitsInConvex] Checking for missing habits...');
    // Ensure habitIdMap exists
    if (!window.habitIdMap) {
      console.log('[ensureHabitsInConvex] Initializing missing window.habitIdMap');
      window.habitIdMap = {};
    }
    
    // Get local habits
    const localHabits = window.HABITS || [];
    if (localHabits.length === 0) {
      console.log('[ensureHabitsInConvex] No local habits found');
      return { created: 0, existing: 0 };
    }
    
    // Get existing habits from Convex
    const convexHabits = await runQuery("habits.getHabits", { token });
    console.log('[ensureHabitsInConvex] Convex habits:', convexHabits?.length || 0);
    
    // Create a map of existing habits by name+icon for quick lookup
    const existingHabitMap = new Map();
    if (convexHabits && convexHabits.length > 0) {
      convexHabits.forEach(h => {
        const key = `${h.name}|${h.icon}`;
        existingHabitMap.set(key, h);
      });
    }
    
    let createdCount = 0;
    const createdHabitIds = [];
    
    // Create missing habits in Convex
    for (const localHabit of localHabits) {
      // Skip special habits like 'lang'
      if (localHabit.id === 'lang') continue;
      
      const key = `${localHabit.name}|${localHabit.icon}`;
      if (!existingHabitMap.has(key)) {
        console.log('[ensureHabitsInConvex] Creating missing habit:', localHabit.name);
        try {
          // Create habit in Convex using token-based mutation
          const habitData = {
            token,
            name: localHabit.name,
            icon: localHabit.icon,
            description: localHabit.sub || '',
            points: localHabit.pts || 20
          };
           
          try {
            const habitId = await runMutation("habits.createHabitWithToken", habitData);
            console.log('[ensureHabitsInConvex] Created habit in Convex:', localHabit.name, 'ID:', habitId);
            createdHabitIds.push(habitId);
            createdCount++;
             
            // Update habitIdMap with new mapping
            if (window.habitIdMap) {
              window.habitIdMap[localHabit.id] = habitId;
              console.log('[ensureHabitsInConvex] Updated habitIdMap:', localHabit.id, '->', habitId);
            }
          } catch (error) {
            console.error('[ensureHabitsInConvex] Failed to create habit:', error);
            // If mutation not found, it might not be deployed yet
            if (error.message.includes('not found')) {
              console.warn('[ensureHabitsInConvex] Mutation not available yet. Deploy Convex code first.');
              // Return early since mutation doesn't exist
              return { created: 0, existing: convexHabits?.length || 0, error: 'Mutation not deployed' };
            }
          }
        } catch (error) {
          console.error('[ensureHabitsInConvex] Failed to create habit:', error);
        }
      } else {
        console.log('[ensureHabitsInConvex] Habit already exists:', localHabit.name);
        // Update habitIdMap with existing mapping
        const existingHabit = existingHabitMap.get(key);
        if (window.habitIdMap && existingHabit) {
          window.habitIdMap[localHabit.id] = existingHabit._id;
          console.log('[ensureHabitsInConvex] Updated habitIdMap with existing:', localHabit.id, '->', existingHabit._id);
        }
      }
    }
    
    // Save updated habitIdMap to localStorage
    if (window.habitIdMap && Object.keys(window.habitIdMap).length > 0) {
      try {
        localStorage.setItem('dailywins_habitIdMap', JSON.stringify(window.habitIdMap));
        console.log(`[ensureHabitsInConvex] Saved habitIdMap to localStorage: ${Object.keys(window.habitIdMap).length} mappings`);
      } catch (e) {
        console.error('[ensureHabitsInConvex] Failed to save habitIdMap:', e);
      }
    }
    
    console.log(`[ensureHabitsInConvex] Completed: ${createdCount} habits created, ${convexHabits?.length || 0} existing`);
    return { 
      created: createdCount, 
      existing: convexHabits?.length || 0,
      mappings: Object.keys(window.habitIdMap || {}).length
    };
    
  } catch (error) {
    console.error('[ensureHabitsInConvex] Error:', error);
    return { created: 0, existing: 0, error: error.message };
  }
}

window.ensureHabitsInConvex = ensureHabitsInConvex;

async function checkAuth() {
  if (!convexInitialized) {
    await initAuth();
  }
  
  const token = getStoredToken();
  
  if (!token) {
    authState = AUTH_STATES.LOGGED_OUT;
    currentUser = null;
    notifyAuthChange();
    return { state: authState, user: null };
  }
  
  if (!isConnected()) {
    console.warn('Convex not connected, using offline mode');
    currentUser = { _id: 'offline', email: 'offline' };
    authState = AUTH_STATES.OFFLINE;
    localStorage.setItem(LOGGED_IN_KEY, 'true');
    notifyAuthChange();
    return { state: authState, user: currentUser };
  }
  
  try {
    const user = await runQuery("auth.verifyToken", { token });
    
    if (user) {
      currentUser = user;
      authState = user.onboardingComplete ? AUTH_STATES.LOGGED_IN : AUTH_STATES.ONBOARDING;
      localStorage.setItem(LOGGED_IN_KEY, 'true');
    } else {
      console.warn('Token verification returned null, keeping offline mode');
      currentUser = { _id: 'pending', email: 'pending' };
      authState = AUTH_STATES.OFFLINE;
      localStorage.setItem(LOGGED_IN_KEY, 'true');
    }
  } catch (error) {
    console.error("Auth check failed:", error);
    currentUser = { _id: 'pending', email: 'pending' };
    authState = AUTH_STATES.OFFLINE;
    localStorage.setItem(LOGGED_IN_KEY, 'true');
  }
  
  notifyAuthChange();
  return { state: authState, user: currentUser };
}

async function signUp(email, password, name) {
  if (!isConnected()) {
    return { success: false, message: "Cannot connect to server." };
  }
  
  try {
    const result = await runMutation("auth.signUp", { email, password, name });
    
    if (result.success) {
      console.log('SignUp succeeded, token:', result.token ? 'present' : 'missing');
      storeToken(result.token);
      currentUser = { _id: result.userId, email, name, onboardingComplete: false };
      authState = AUTH_STATES.ONBOARDING;
      console.log('Calling notifyAuthChange, authState:', authState);
      notifyAuthChange();
      console.log('notifyAuthChange called');
    }
    
    return result;
  } catch (error) {
    return { success: false, message: error.message || "Sign up failed" };
  }
}

async function logIn(email, password) {
  if (!isConnected()) {
    return { success: false, message: "Cannot connect to server." };
  }
  
  try {
    const result = await runMutation("auth.logIn", { email, password });
    
    if (result.success) {
      storeToken(result.token);
      const user = await runQuery("auth.verifyToken", { token: result.token });
      
      if (user) {
        currentUser = user;
        authState = user.onboardingComplete ? AUTH_STATES.LOGGED_IN : AUTH_STATES.ONBOARDING;
        notifyAuthChange();
      }
    }
    
    return result;
  } catch (error) {
    return { success: false, message: error.message || "Login failed" };
  }
}

async function logOut() {
  const token = getStoredToken();
  
  if (token && isConnected()) {
    try {
      await runMutation("auth.logOut", { token });
    } catch (e) {
      console.error("Logout error:", e);
    }
  }
  
  stopBackgroundSync();
  storeToken(null);
  currentUser = null;
  authState = AUTH_STATES.LOGGED_OUT;
  notifyAuthChange();
  return { success: true };
}

function logoutUser() {
  logOut().then(() => {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('onboarding-container').style.display = 'none';
    appInitialized = false;
  });
}

function toggleTheme() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? '' : 'dark';
  
  if (newTheme) {
    html.setAttribute('data-theme', newTheme);
  } else {
    html.removeAttribute('data-theme');
  }
  
  if (typeof state !== 'undefined') {
    state.settings = state.settings || {};
    state.settings.theme = newTheme;
    saveState();
  }
  
  const toggleEl = document.getElementById('themeToggle');
  if (toggleEl) {
    toggleEl.className = 'toggle' + (newTheme === 'dark' ? ' on' : '');
  }
}

function initTheme() {
  const html = document.documentElement;
  const savedTheme = localStorage.getItem('theme');
  
  if (savedTheme === 'dark') {
    html.setAttribute('data-theme', 'dark');
  } else {
    html.removeAttribute('data-theme');
  }
  
  const toggleEl = document.getElementById('themeToggle');
  if (toggleEl) {
    const currentTheme = html.getAttribute('data-theme');
    toggleEl.className = 'toggle' + (currentTheme === 'dark' ? ' on' : '');
  }
}

async function completeOnboarding(habits, waterGoal, language) {
  if (!isConnected()) throw new Error("Cannot connect to server");
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  await runMutation("users.completeOnboarding", { token, habits, waterGoal, language });
}

// ════════════════════════════════════
//  STORE
// ════════════════════════════════════

const store = {
  habits: [],
  tasks: [],
  todayHabits: [],
  water: { glasses: 0, goal: 8 },
  user: null,
  stats: null,
  streak: null,
  loading: true,
};

const storeListeners = new Map();

function subscribeToState(key, callback) {
  if (!storeListeners.has(key)) {
    storeListeners.set(key, []);
  }
  storeListeners.get(key).push(callback);
  
  if (store[key] !== undefined) {
    callback(store[key]);
  }
  
  return () => {
    const subs = storeListeners.get(key);
    const index = subs.indexOf(callback);
    if (index > -1) subs.splice(index, 1);
  };
}

function updateState(key, value) {
  store[key] = value;
  if (storeListeners.has(key)) {
    storeListeners.get(key).forEach((cb) => cb(store[key]));
  }
}

async function initStore() {
  updateState("loading", true);
  
  try {
    const userData = await runQuery("users.getCurrentUser", {});
    updateState("user", userData);
    
    if (userData) {
      const stats = await runQuery("users.getStats", {});
      updateState("stats", stats);
      
      const streak = await runQuery("habits.getStreakInfo", {});
      updateState("streak", streak);
    }
    
    const today = new Date().toISOString().slice(0, 10);
    const habits = await runQuery("habits.listHabits", {});
    updateState("habits", habits || []);
    
    const todayHabits = await runQuery("habits.getHabitsForDate", { date: today });
    updateState("todayHabits", todayHabits || []);
    
    const tasks = await runQuery("tasks.listTasks", {});
    updateState("tasks", tasks || []);
    
    const water = await runQuery("water.getWaterLog", { date: today });
    updateState("water", water || { glasses: 0, goal: 8 });
  } catch (error) {
    console.error("Failed to initialize store:", error);
  }
  
  updateState("loading", false);
}

async function toggleHabit(habitId) {
  const today = new Date().toISOString().slice(0, 10);
  const result = await runMutation("habits.toggleHabit", { habitId, date: today });
  await initStore();
  return result;
}

async function createHabit(habit) {
  await runMutation("habits.createHabit", habit);
  await initStore();
}

async function createTask(text) {
  await runMutation("tasks.createTask", { text });
  await initStore();
}

// Deprecated - using local-only task toggle
async function toggleTaskDeprecated(taskId) {
  await runMutation("tasks.toggleTask", { taskId });
  await initStore();
}

// These functions are deprecated - using local-only water tracking
async function addWaterDeprecated() {
  const today = new Date().toISOString().slice(0, 10);
  const result = await runMutation("water.addWater", { date: today });
  updateState("water", { glasses: result.glasses, goal: result.goal });
  return result;
}

async function removeWaterDeprecated() {
  const today = new Date().toISOString().slice(0, 10);
  const result = await runMutation("water.removeWater", { date: today });
  updateState("water", { glasses: result.glasses, goal: result.goal });
  return result;
}



async function saveIntention(text) {
  const today = new Date().toISOString().slice(0, 10);
  await runMutation("intentions.saveIntention", { date: today, text });
}

async function saveReflection(selectedOptions) {
  const today = new Date().toISOString().slice(0, 10);
  await runMutation("reflections.saveReflection", { date: today, selectedOptions });
  await initStore();
}

async function markLetterMastered(letter) {
  console.log('[markLetterMastered] Marking letter as mastered:', letter);
  const token = getStoredToken();
  console.log('[markLetterMastered] Token present:', !!token);
  if (!token) throw new Error("Not authenticated");
  try {
    const result = await runMutation("language.markLetterMastered", { token, letter });
    console.log('[markLetterMastered] Mutation successful:', result);
    await initStore();
    console.log('[markLetterMastered] Store reinitialized');
  } catch (error) {
    console.error('[markLetterMastered] Mutation failed:', error);
    throw error;
  }
}
window.markLetterMastered = markLetterMastered;

// ════════════════════════════════════
//  ONBOARDING
// ════════════════════════════════════

const TEMPLATES = {
  health: {
    name: "Health & Wellness",
    emoji: "💪",
    habits: [
      { name: "Drink 8 glasses of water", icon: "💧", description: "Stay hydrated throughout the day", points: 20 },
      { name: "Exercise for 30 minutes", icon: "🏃", description: "Any form of physical activity counts", points: 30 },
      { name: "Eat healthy meals", icon: "🥗", description: "Choose whole foods and vegetables", points: 25 },
      { name: "Get 7+ hours of sleep", icon: "😴", description: "Rest is essential for recovery", points: 15 },
    ],
  },
  productivity: {
    name: "Productivity",
    emoji: "🎯",
    habits: [
      { name: "Complete top 3 tasks", icon: "✅", description: "Focus on your most important work", points: 30 },
      { name: "Deep work session", icon: "🧠", description: "2+ hours of focused, distraction-free work", points: 25 },
      { name: "Learn something new", icon: "📚", description: "Read, watch, or study something educational", points: 20 },
      { name: "No phone during focus time", icon: "🔇", description: "Keep your phone away during work", points: 15 },
    ],
  },
};

const LANGUAGES = [
  { code: "spanish", name: "Spanish", flag: "🇪🇸" },
  { code: "french", name: "French", flag: "🇫🇷" },
  { code: "german", name: "German", flag: "🇩🇪" },
  { code: "japanese", name: "Japanese", flag: "🇯🇵" },
  { code: "none", name: "No language learning", flag: "❌" },
];

let currentStep = 0;
let selectedTemplate = null;
let customHabits = [];
let waterGoal = 8;
let selectedLanguage = "spanish";

function renderOnboarding(container) {
  console.log('renderOnboarding called, currentStep:', currentStep);
  const stepHtml = renderStep(currentStep);
  console.log('Step HTML length:', stepHtml.length);
  console.log('Step HTML preview:', stepHtml.substring(0, 200));
  
  const onboardingDiv = document.createElement('div');
  onboardingDiv.id = 'onboarding';
  onboardingDiv.className = 'onboarding';
  onboardingDiv.innerHTML = stepHtml;
  
  container.innerHTML = '';
  container.appendChild(onboardingDiv);
  
  console.log('Container children after render:', container.children.length);
  console.log('Onboarding div children:', document.getElementById('onboarding')?.children.length);
  setupOnboardingHandlers(container);
}

function renderStep(step) {
  const steps = [
    renderWelcomeStep(),
    renderTemplateStep(),
    renderCustomizeStep(),
    renderGoalStep(),
    renderLanguageStep(),
    renderCompleteStep(),
  ];
  return steps[step] || steps[0];
}

function renderWelcomeStep() {
  return `
    <div class="onboarding-step active">
      <div class="onboarding-icon">🏆</div>
      <h2>Daily Wins</h2>
      <p>Build lasting habits and track your daily wins. Let's set up your personalized experience.</p>
      <div class="onboarding-actions">
        <button class="onboarding-btn primary" id="btn-next">Get Started</button>
      </div>
    </div>
  `;
}

function renderTemplateStep() {
  const templateCards = Object.entries(TEMPLATES)
    .map(([key, template]) => `
      <div class="template-card" data-template="${key}">
        <div class="template-emoji">${template.emoji}</div>
        <div class="template-name">${template.name}</div>
      </div>
    `).join("");
  
  const customCard = `
    <div class="template-card" data-template="custom">
      <div class="template-emoji">✨</div>
      <div class="template-name">Custom</div>
    </div>
  `;
  
  return `
    <div class="onboarding-step active">
      <div class="onboarding-progress">
        <div class="progress-dot active"></div>
        <div class="progress-dot active"></div>
        <div class="progress-dot"></div>
        <div class="progress-dot"></div>
        <div class="progress-dot"></div>
      </div>
      <h2>Choose Your Focus</h2>
      <p>Pick a starting template or create your own habits.</p>
      <div class="template-grid">
        ${templateCards}
        ${customCard}
      </div>
      <div class="onboarding-actions">
        <button class="onboarding-btn primary" id="btn-next">Continue</button>
      </div>
    </div>
  `;
}

function renderCustomizeStep() {
  if (selectedTemplate === "custom") {
    return `
      <div class="onboarding-step active">
        <div class="onboarding-progress">
          <div class="progress-dot active"></div>
          <div class="progress-dot active"></div>
          <div class="progress-dot active"></div>
          <div class="progress-dot"></div>
          <div class="progress-dot"></div>
        </div>
        <h2>Create Your Habits</h2>
        <p>Add up to 6 daily habits. Start with at least 1.</p>
        <div id="custom-habits-list">
          ${renderCustomHabitInputs()}
        </div>
        <button class="onboarding-btn secondary" id="btn-add-habit">+ Add Habit</button>
        <div class="onboarding-actions">
          <button class="onboarding-btn secondary" id="btn-back">Back</button>
          <button class="onboarding-btn primary" id="btn-next">Continue</button>
        </div>
      </div>
    `;
  }
  
  const template = TEMPLATES[selectedTemplate];
  if (!template) return "";
  
  const habitCheckboxes = template.habits
    .map((habit, i) => `
      <label class="habit-checkbox">
        <input type="checkbox" data-habit="${i}" checked>
        <span class="habit-icon">${habit.icon}</span>
        <span class="habit-name">${habit.name}</span>
      </label>
    `).join("");
  
  return `
    <div class="onboarding-step active">
      <div class="onboarding-progress">
        <div class="progress-dot active"></div>
        <div class="progress-dot active"></div>
        <div class="progress-dot active"></div>
        <div class="progress-dot"></div>
        <div class="progress-dot"></div>
      </div>
      <h2>Customize Habits</h2>
      <p>Choose which habits to include from the ${template.name} template.</p>
      <div class="habits-list">
        ${habitCheckboxes}
      </div>
      <div class="onboarding-actions">
        <button class="onboarding-btn secondary" id="btn-back">Back</button>
        <button class="onboarding-btn primary" id="btn-next">Continue</button>
      </div>
    </div>
  `;
}

function renderGoalStep() {
  return `
    <div class="onboarding-step active">
      <div class="onboarding-progress">
        <div class="progress-dot active"></div>
        <div class="progress-dot active"></div>
        <div class="progress-dot active"></div>
        <div class="progress-dot active"></div>
        <div class="progress-dot"></div>
      </div>
      <h2>Set Your Water Goal</h2>
      <p>How many glasses of water do you want to drink daily?</p>
      <div class="goal-selector">
        <button class="goal-btn" id="goal-decrease">-</button>
        <div class="goal-value">${waterGoal} <span>glasses</span></div>
        <button class="goal-btn" id="goal-increase">+</button>
      </div>
      <div class="onboarding-actions">
        <button class="onboarding-btn secondary" id="btn-back">Back</button>
        <button class="onboarding-btn primary" id="btn-next">Continue</button>
      </div>
    </div>
  `;
}

function renderLanguageStep() {
  const languageOptions = LANGUAGES.map(lang => `
    <label class="language-option ${lang.code === selectedLanguage ? "selected" : ""}">
      <input type="radio" name="language" value="${lang.code}" ${lang.code === selectedLanguage ? "checked" : ""}>
      <span class="lang-flag">${lang.flag}</span>
      <span class="lang-name">${lang.name}</span>
    </label>
  `).join("");
  
  return `
    <div class="onboarding-step active">
      <div class="onboarding-progress">
        <div class="progress-dot active"></div>
        <div class="progress-dot active"></div>
        <div class="progress-dot active"></div>
        <div class="progress-dot active"></div>
        <div class="progress-dot active"></div>
      </div>
      <h2>Choose Your Language</h2>
      <p>Pick a language for daily practice challenges.</p>
      <div class="language-grid">
        ${languageOptions}
      </div>
      <div class="onboarding-actions">
        <button class="onboarding-btn secondary" id="btn-back">Back</button>
        <button class="onboarding-btn primary" id="btn-finish">Let's Go!</button>
      </div>
    </div>
  `;
}

function renderCompleteStep() {
  return `
    <div class="onboarding-step active">
      <div class="onboarding-icon">🎉</div>
      <h2>You're All Set!</h2>
      <p>Your Daily Wins is ready. Start building your habits and tracking your progress!</p>
      <div class="onboarding-actions">
        <button class="onboarding-btn primary" id="btn-start">Start Winning</button>
      </div>
    </div>
  `;
}

function renderCustomHabitInputs() {
  if (customHabits.length === 0) {
    customHabits = [{ name: "", icon: "✅", description: "" }];
  }
  
  return customHabits.map((habit, i) => `
    <div class="custom-habit-input">
      <input type="text" placeholder="Habit name" value="${habit.name}" data-field="name" data-index="${i}">
      <input type="text" placeholder="Icon" value="${habit.icon}" data-field="icon" data-index="${i}" maxlength="2" class="icon-input">
      <button class="remove-habit" data-index="${i}">✕</button>
    </div>
  `).join("");
}

function setupOnboardingHandlers(container) {
  const btnNext = container.querySelector("#btn-next");
  const btnBack = container.querySelector("#btn-back");
  const btnFinish = container.querySelector("#btn-finish");
  const btnStart = container.querySelector("#btn-start");
  const btnAddHabit = container.querySelector("#btn-add-habit");
  
  if (btnNext) {
    btnNext.addEventListener("click", () => {
      console.log('btnNext clicked, currentStep:', currentStep);
      if (currentStep === 1) {
        const selected = container.querySelector(".template-card.selected");
        if (!selected) {
          alert("Please select a template");
          return;
        }
        selectedTemplate = selected.dataset.template;
        
        if (selectedTemplate === "custom") {
          customHabits = [{ name: "", icon: "✅", description: "" }];
        }
      }
      
      if (currentStep === 2 && selectedTemplate === "custom") {
        const inputs = container.querySelectorAll(".custom-habit-input");
        customHabits = Array.from(inputs).map((input) => ({
          name: input.querySelector('[data-field="name"]').value,
          icon: input.querySelector('[data-field="icon"]').value || "✅",
          description: "",
        })).filter((h) => h.name.trim());
        
        if (customHabits.length === 0) {
          alert("Please add at least one habit");
          return;
        }
      }
      
      if (currentStep === 2 && selectedTemplate !== "custom") {
        const checked = container.querySelectorAll('input[type="checkbox"]:checked');
        const templateHabits = TEMPLATES[selectedTemplate].habits;
        customHabits = Array.from(checked).map((cb) => {
          const idx = parseInt(cb.dataset.habit);
          return templateHabits[idx];
        });
      }
      
      currentStep++;
      console.log('After increment, currentStep:', currentStep);
      const nextHtml = renderStep(currentStep);
      console.log('Next HTML length:', nextHtml.length);
      container.querySelector("#onboarding").innerHTML = nextHtml;
      setupOnboardingHandlers(container);
    });
  }
  
  if (btnBack) {
    btnBack.addEventListener("click", () => {
      currentStep--;
      container.querySelector("#onboarding").innerHTML = renderStep(currentStep);
      setupOnboardingHandlers(container);
    });
  }
  
  if (btnFinish || btnStart) {
    const btn = btnFinish || btnStart;
    btn.addEventListener("click", async () => {
      btn.textContent = "Setting up...";
      btn.disabled = true;
      
      try {
        console.log("Selected template:", selectedTemplate);
        console.log("Custom habits before processing:", customHabits);
        
        if (selectedTemplate === "custom") {
          const inputs = container.querySelectorAll(".custom-habit-input");
          customHabits = Array.from(inputs).map((input) => ({
            name: input.querySelector('[data-field="name"]').value,
            icon: input.querySelector('[data-field="icon"]').value || "✅",
            description: "",
            points: 20,
          })).filter((h) => h.name.trim());
        }
        
        console.log("Custom habits after processing:", customHabits);
        console.log("Water goal:", waterGoal);
        console.log("Language:", selectedLanguage);
        
        await completeOnboarding(customHabits, waterGoal, selectedLanguage);
        
        // Try to fetch habits from Convex with their real IDs
        const token = getStoredToken();
        let habitsFromConvex = [];
        if (token) {
          try {
            habitsFromConvex = await runQuery("habits.getHabits", { token });
            console.log('Fetched habits from Convex after onboarding:', habitsFromConvex);
          } catch (e) {
            console.error('Failed to fetch habits after onboarding:', e);
          }
        }

        // Save habits to localStorage - prefer Convex habits if available
        if (habitsFromConvex.length > 0) {
          const habitsToSave = habitsFromConvex.map(h => ({
            id: h._id,
            name: h.name,
            icon: h.icon,
            pts: h.points || 20,
            sub: h.description || ''
          }));
          localStorage.setItem('dailywins_habits', JSON.stringify(habitsToSave));
          console.log('Saved Convex habits to localStorage:', habitsToSave);
        } else {
          // Fallback to local IDs
          const habitsToSave = customHabits.map((h, i) => ({
            id: `habit-${i}`,
            name: h.name,
            icon: h.icon,
            pts: h.points || 20,
            sub: h.description || ''
          }));
          localStorage.setItem('dailywins_habits', JSON.stringify(habitsToSave));
          console.log('Saved local habits to localStorage:', habitsToSave);
        }
        
        // Reload to initialize app
        window.location.reload();
      } catch (error) {
        console.error("Onboarding failed:", error);
        btn.textContent = "Setup Failed - Try Again";
        btn.disabled = false;
      }
    });
  }
  
  if (btnAddHabit) {
    btnAddHabit.addEventListener("click", () => {
      if (customHabits.length >= 6) return;
      customHabits.push({ name: "", icon: "✅", description: "" });
      container.querySelector("#custom-habits-list").innerHTML = renderCustomHabitInputs();
      setupOnboardingHandlers(container);
    });
  }
  
  container.querySelectorAll(".template-card").forEach((card) => {
    card.addEventListener("click", () => {
      container.querySelectorAll(".template-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
    });
  });
  
  container.querySelectorAll(".language-option").forEach((option) => {
    option.addEventListener("click", () => {
      selectedLanguage = option.querySelector('input').value;
      container.querySelectorAll(".language-option").forEach((o) => o.classList.remove("selected"));
      option.classList.add("selected");
    });
  });
  
  const goalDecrease = container.querySelector("#goal-decrease");
  const goalIncrease = container.querySelector("#goal-increase");
  
  if (goalDecrease) {
    goalDecrease.addEventListener("click", () => {
      if (waterGoal > 4) {
        waterGoal--;
        container.querySelector(".goal-value").innerHTML = `${waterGoal} <span>glasses</span>`;
      }
    });
  }
  
  if (goalIncrease) {
    goalIncrease.addEventListener("click", () => {
      if (waterGoal < 16) {
        waterGoal++;
        container.querySelector(".goal-value").innerHTML = `${waterGoal} <span>glasses</span>`;
      }
    });
  }
  
  container.querySelectorAll(".remove-habit").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const index = parseInt(e.target.dataset.index);
      if (customHabits.length > 1) {
        customHabits.splice(index, 1);
        container.querySelector("#custom-habits-list").innerHTML = renderCustomHabitInputs();
        setupOnboardingHandlers(container);
      }
    });
  });
}

// ════════════════════════════════════
//  APP INITIALIZATION
// ════════════════════════════════════

let appInitialized = false;

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';
}

function showAuth() {
  const screen = document.getElementById('auth-screen');
  if (screen) screen.style.display = 'flex';
}

async function initApp() {
  console.log('initApp starting...');
  // First, initialize Convex connection
  await initAuth();
  console.log('Auth initialized');
  
    try {
    // Quick timeout - don't wait for Convex on initial load
    const timeoutPromise = new Promise(resolve => 
      setTimeout(() => resolve({ state: 'timeout', user: null }), 5000)
    );
    
    const authPromise = checkAuth();
    const result = await Promise.race([authPromise, timeoutPromise]);
    const { state, user } = result;
    console.log('Auth checked, state:', state, 'user:', user);
    
    hideLoading();
    
    // Check if we have a token and were logged in before - show app regardless of auth state
    const token = getStoredToken();
    const wasLoggedIn = localStorage.getItem(LOGGED_IN_KEY) === 'true';
    if (token && wasLoggedIn) {
      console.log('Has token and was logged in - staying in app');
      const screen = document.getElementById('auth-screen');
      if (screen) screen.style.display = 'none';
      // Render the UI immediately
      if (typeof renderHabits === 'function') renderHabits();
      if (typeof renderWater === 'function') renderWater();
      if (typeof renderHeader === 'function') renderHeader();
      if (typeof renderLang === 'function') renderLang();
      if (typeof renderTasks === 'function') renderTasks();
      if (typeof renderAll === 'function') renderAll();
      appInitialized = true;
      // Start background sync
      startBackgroundSync();
      // Try to load full data from Convex
      loadUserDataFromConvex().catch(() => {});
      return;
    }
    
    // No token or not logged in - show auth screen
    showAuth();
    return;
  } catch (error) {
    console.error('App initialization error:', error);
    hideLoading();
    // If we have a token and were logged in before, stay in app
    const token = getStoredToken();
    const wasLoggedIn = localStorage.getItem(LOGGED_IN_KEY) === 'true';
    if (token && wasLoggedIn) {
      console.log('Error but has token - staying in app');
      const screen = document.getElementById('auth-screen');
      if (screen) screen.style.display = 'none';
      // Render UI
      if (typeof renderHabits === 'function') renderHabits();
      if (typeof renderWater === 'function') renderWater();
      if (typeof renderHeader === 'function') renderHeader();
      if (typeof renderLang === 'function') renderLang();
      if (typeof renderTasks === 'function') renderTasks();
      if (typeof renderAll === 'function') renderAll();
      appInitialized = true;
    } else {
      showAuth();
    }
  }
}

// Listen for auth changes - only handle state changes, not initial call
let firstAuthCall = true;
onAuthChange((state, user) => {
  if (firstAuthCall) {
    firstAuthCall = false;
    return; // Skip initial call, initApp handles it
  }
  
  console.log('Auth state changed:', state, 'user:', user);
  
  // If app is already initialized and we have a token, ignore state changes
  // (but still ensure background sync is running)
  if (appInitialized && getStoredToken()) {
    startBackgroundSync();
    return;
  }
  
  const authScreen = document.getElementById('auth-screen');
  const onboardingContainer = document.getElementById('onboarding-container');
  const token = getStoredToken();
  const wasLoggedIn = localStorage.getItem(LOGGED_IN_KEY) === 'true';
  
  // If we have a token and were logged in, stay in the app
  if (token && wasLoggedIn) {
    console.log('Has token and was logged in - staying in app');
    if (authScreen) authScreen.style.display = 'none';
    if (onboardingContainer) onboardingContainer.style.display = 'none';
    // Render UI
    if (typeof renderHabits === 'function') renderHabits();
    if (typeof renderWater === 'function') renderWater();
    if (typeof renderHeader === 'function') renderHeader();
    if (typeof renderLang === 'function') renderLang();
    if (typeof renderTasks === 'function') renderTasks();
    appInitialized = true;
    loadUserDataFromConvex().catch(() => {});
    startBackgroundSync();
    return;
  }
  
  // Handle other states
  if (state === AUTH_STATES.ONBOARDING) {
    console.log('Showing onboarding');
    if (authScreen) authScreen.style.display = 'none';
    if (onboardingContainer) {
      onboardingContainer.style.display = 'block';
      renderOnboarding(onboardingContainer);
    }
    startBackgroundSync();
  } else if (state === AUTH_STATES.LOGGED_IN) {
    console.log('User logged in, starting sync');
    startBackgroundSync();
    // Ensure UI is rendered
    if (authScreen) authScreen.style.display = 'none';
    if (onboardingContainer) onboardingContainer.style.display = 'none';
    if (typeof renderHabits === 'function') renderHabits();
    if (typeof renderWater === 'function') renderWater();
    if (typeof renderHeader === 'function') renderHeader();
    if (typeof renderLang === 'function') renderLang();
    if (typeof renderTasks === 'function') renderTasks();
    appInitialized = true;
    loadUserDataFromConvex().catch(() => {});
  } else if (state === AUTH_STATES.LOGGED_OUT) {
    console.log('Showing auth screen');
    if (authScreen) authScreen.style.display = 'flex';
    if (onboardingContainer) onboardingContainer.style.display = 'none';
  }
});

async function loadUserDataFromConvex() {
  try {
    console.log('loadUserDataFromConvex starting...');
    const token = getStoredToken();
    if (!token) {
      console.log('No token found');
      return;
    }
    
    console.log('Fetching user data...');
    const user = await runQuery("users.getUserData", { token });
    console.log('User data:', user);
    console.log('User name:', user?.name);
    if (!user) return;
    
    if (window.state) {
      // Only use Convex values if localStorage is empty/default
      if (!window.state.totalPoints || window.state.totalPoints === 0) {
        window.state.totalPoints = user.totalPoints || 0;
      }
      window.state.streak = user.currentStreak || 0;
      window.state.bestStreak = user.bestStreak || 0;
      window.state.totalDays = user.totalDays || 0;
      window.state.settings = window.state.settings || {};
      window.state.settings.lang = user.language || 'spanish';
      window.state.settings.template = user.template || 'health';
      window.state.userName = user.name || '';
      console.log('Setting userName to:', window.state.userName);
      if (window.state.settings.theme) {
        document.documentElement.setAttribute('data-theme', window.state.settings.theme);
      }
      saveState();
      console.log('State saved, userName:', window.state.userName);
      console.log('State updated, totalPoints preserved from localStorage:', window.state.totalPoints);
    }
    
    console.log('Fetching habits...');
    let habits = await runQuery("habits.getHabits", { token });
    console.log('Habits from Convex:', habits);
    if (habits && habits.length > 0) {
      console.log('First habit details:', {
        _id: habits[0]._id,
        _idLength: habits[0]._id?.length,
        _idType: typeof habits[0]._id,
        name: habits[0].name,
        fullObject: habits[0]
      });
    }
    
    // Check if we need to create missing habits in Convex
    const localHabits = window.HABITS || [];
    console.log('[loadUserDataFromConvex] localHabits count:', localHabits.length, 'Convex habits count:', habits?.length || 0);
    if (localHabits.length > 0) {
      console.log('[loadUserDataFromConvex] Calling ensureHabitsInConvex...');
      const syncResult = await ensureHabitsInConvex(token);
      console.log('[loadUserDataFromConvex] ensureHabitsInConvex result:', syncResult);
      if (syncResult.created > 0) {
        // Habits were created, refetch from Convex to get their IDs
        console.log('Refetching habits after creation...');
        habits = await runQuery("habits.getHabits", { token });
        console.log('Updated habits from Convex:', habits);
      }
    } else if (!habits || habits.length === 0) {
      console.warn('No habits found in Convex or locally');
    }
    
    // Update HABITS in the main page scope
    window.userHabits = habits || [];
    console.log('[loadUserDataFromConvex] Set window.userHabits:', window.userHabits.length, 'habits', window.userHabits);
    window.WATER_GOAL = user.waterGoal || 8;
    
    // Also update the HABITS array in index.html if we have habits from Convex
    // Migrate completion status from old habit IDs to new Convex IDs
    window.habitIdMap = window.habitIdMap || {};
    
    // Always initialize habitIdMap from localStorage if available
    try {
      const savedMap = localStorage.getItem('dailywins_habitIdMap');
      if (savedMap) {
        window.habitIdMap = { ...window.habitIdMap, ...JSON.parse(savedMap) };
        console.log('Loaded habitIdMap from localStorage:', Object.keys(window.habitIdMap).length, 'mappings');
      }
    } catch (e) {
      console.error('Error loading habitIdMap:', e);
    }
    
    if (window.HABITS && window.todayData?.done) {
      const oldHabits = window.HABITS;
      const done = window.todayData.done;
      const newDone = {};
      const matchedConvexIds = new Set();
      
      if (habits && habits.length > 0) {
        // Create a map from (name + icon) to Convex habit for matching
        const convexHabitMap = new Map();
        habits.forEach(h => {
          const key = `${h.name}|${h.icon}`;
          convexHabitMap.set(key, h);
        });
        
        // First pass: try to match local habits to Convex habits by name+icon
        oldHabits.forEach(oldHabit => {
          const key = `${oldHabit.name}|${oldHabit.icon}`;
          const convexHabit = convexHabitMap.get(key);
          if (convexHabit && done[oldHabit.id] !== undefined) {
            newDone[convexHabit._id] = done[oldHabit.id];
            matchedConvexIds.add(convexHabit._id);
            // Store mapping from old ID to Convex ID for frontend use
            window.habitIdMap[oldHabit.id] = convexHabit._id;
          } else if (done[oldHabit.id] !== undefined) {
            // No match, keep old ID (might be special habit like 'lang')
            newDone[oldHabit.id] = done[oldHabit.id];
          }
        });
        
        // Map Convex IDs to themselves for completeness
        habits.forEach(h => {
          window.habitIdMap[h._id] = h._id;
        });
        
        // Add completion status for Convex habits that weren't matched (e.g., habits added on another device)
        habits.forEach(h => {
          if (!matchedConvexIds.has(h._id) && done[h._id] === undefined) {
            // New habit from Convex, not yet completed locally
            newDone[h._id] = false;
          } else if (done[h._id] !== undefined) {
            // Already have completion status for this Convex ID (maybe from previous migration)
            newDone[h._id] = done[h._id];
          }
        });
      } else {
        // No Convex habits yet - keep local IDs as-is
        console.log('No Convex habits found, preserving local habit IDs');
        oldHabits.forEach(oldHabit => {
          if (done[oldHabit.id] !== undefined) {
            newDone[oldHabit.id] = done[oldHabit.id];
          }
        });
      }
      
      // Keep any other entries that aren't habits (e.g., 'lang' habit with special ID)
      Object.keys(done).forEach(key => {
        if (newDone[key] === undefined && !oldHabits.some(h => h.id === key) && 
            (!habits || !habits.some(h => h._id === key))) {
          newDone[key] = done[key];
        }
      });
      
      window.todayData.done = newDone;
      console.log('Migrated completion status from old habit IDs to Convex IDs', { 
        old: Object.keys(done).length, 
        new: Object.keys(newDone).length,
        hasConvexHabits: !!(habits && habits.length > 0)
      });
      
      // Save habit ID mapping to localStorage for persistence
      if (window.habitIdMap && Object.keys(window.habitIdMap).length > 0) {
        localStorage.setItem('dailywins_habitIdMap', JSON.stringify(window.habitIdMap));
        console.log('Saved habitIdMap to localStorage:', Object.keys(window.habitIdMap).length, 'mappings');
      } else {
        console.log('habitIdMap is empty, not saving to localStorage');
      }
    }

    if (habits && habits.length > 0) {
      const convexHabits = habits.map(h => ({
        id: h._id,
        name: h.name,
        icon: h.icon,
        pts: h.points || 20,
        sub: h.description || ''
      }));
      // Save to localStorage via window.saveHABITS
      if (typeof window.saveHABITS === 'function') {
        window.saveHABITS(convexHabits);
      }
      // Re-render habits with updated HABITS
      if (typeof renderHabits === 'function') renderHabits();
    }
    console.log('Habits updated from Convex');
    console.log('WATER_GOAL set to:', window.WATER_GOAL);
    
    // Load habit logs for today to restore completion state
    const today = new Date().toISOString().slice(0, 10);
    console.log('Fetching habit logs for today:', today);
    const habitLogs = await runQuery("habits.getHabitLogs", { token, date: today });
    console.log('Habit logs:', habitLogs);

    // Load water log for today
    const waterLog = await runQuery("water.getWaterLog", { token, date: today });
    console.log('Water log from Convex:', waterLog);
    if (waterLog && window.todayData) {
      window.todayData.water = Math.max(window.todayData.water || 0, waterLog.glasses || 0);
      saveState();
      if (typeof renderWater === 'function') renderWater();
    }

    // Update todayData.done with completion status
    if (window.todayData && habitLogs) {
      habitLogs.forEach(log => {
        window.todayData.done[log.habitId] = true;
      });
      saveState();
    }
    
    console.log('loadUserDataFromConvex complete');
  } catch (error) {
    console.error('Failed to load user data:', error);
  }
}

// Real-time sync subscriptions
let subscriptions = [];

// Background sync - poll every 10 seconds
let syncTimer = null;
let syncCount = 0;
function startBackgroundSync() {
  if (syncTimer) return;
  console.log('Starting background sync...');
  syncTimer = setInterval(async () => {
    syncCount++;
    const token = getStoredToken();
    console.log(`[Sync #${syncCount}] Running`);
    console.log(`[Sync] Token exists:`, !!token, 'Connected:', isConnected());
    
    if (!token) {
      console.log('[Sync] No token found, skipping');
      return;
    }
    
    if (!isConnected()) {
      console.log('[Sync] Convex not connected, skipping');
      return;
    }
    
    const today = new Date().toISOString().slice(0, 10);
    console.log('[Sync] Today:', today);
    
    try {
      // Sync tasks - MERGE instead of replace
      console.log('[Sync] Fetching tasks from Convex...');
      const convexTasks = await runQuery("tasks.listTasks", { token, date: today });
      console.log('[Sync] Tasks from Convex:', convexTasks?.length || 0, 'tasks');
      
      if (window.state && convexTasks) {
        // Create a map of Convex tasks by _id for quick lookup
        const convexTaskMap = new Map();
        convexTasks.forEach(t => convexTaskMap.set(t._id, t));
        
        // Update existing local tasks and remove those deleted from Convex
        const updatedTasks = [];
        const localIds = new Set();
        
        // First pass: keep only local tasks that are still in Convex or are local-only
        window.state.tasks.forEach(localTask => {
          if (localTask._id) {
            // Task has Convex ID - check if it still exists in Convex
            if (convexTaskMap.has(localTask._id)) {
              // Task exists in Convex - update with latest status
              const convexTask = convexTaskMap.get(localTask._id);
              updatedTasks.push({ ...localTask, done: convexTask.done, text: convexTask.text });
              localIds.add(localTask._id);
            }
            // If task not in Convex (deleted), skip it (do not add to updatedTasks)
          } else {
            // Local-only task (no _id) - keep it
            updatedTasks.push(localTask);
            if (localTask.id) localIds.add(localTask.id);
          }
        });
        
        // Add new tasks from Convex that aren't in local state
        convexTasks.forEach(ct => {
          if (!localIds.has(ct._id)) {
            updatedTasks.push({ _id: ct._id, text: ct.text, done: ct.done, id: Date.now() });
          }
        });
        
        window.state.tasks = updatedTasks;
        saveState();
        console.log('[Sync] window.state.tasks merged, count:', window.state.tasks.length);
        
        if (typeof renderTasks === 'function') {
          renderTasks();
          console.log('[Sync] renderTasks called');
        }
      }
      
      // Sync habit logs
      const logs = await runQuery("habits.getHabitLogs", { token, date: today });
      console.log('[Sync] Habit logs:', logs?.length || 0);
      if (window.todayData) {
        // Get habit IDs from Convex to know which habits exist
        let habits = await runQuery("habits.getHabits", { token });
        if (habits && habits.length === 0 && window.HABITS && window.HABITS.length > 0) {
          console.log('[Sync] No habits in Convex, triggering ensureHabitsInConvex');
          await window.ensureHabitsInConvex(token);
          habits = await runQuery("habits.getHabits", { token });
        }
        const habitIds = habits?.map(h => h._id) || [];
        // Create set of completed habit IDs from Convex
        const completedIds = new Set(logs?.map(log => log.habitId) || []);
        // Update completion status: trust server for cross-device sync
        habitIds.forEach(habitId => {
          const serverCompleted = completedIds.has(habitId);
          const localCompleted = window.todayData.done[habitId];
          console.log(`[Sync] Habit ${habitId}: server=${serverCompleted}, local=${localCompleted}`);
          
          if (serverCompleted) {
            window.todayData.done[habitId] = true;
          } else {
            // Server says not completed - trust server for cross-device sync
            // (mutations are immediate, so server state should reflect local state quickly)
            window.todayData.done[habitId] = false;
          }
        });
        saveState();
        if (typeof renderHabits === 'function') renderHabits();
      }
      
      // Sync water - use max of local and Convex
      const water = await runQuery("water.getWaterLog", { token, date: today });
      console.log('[Sync] Water from Convex:', water);
      if (water && window.todayData) {
        window.todayData.water = Math.max(window.todayData.water || 0, water.glasses || 0);
        saveState();
        if (typeof renderWater === 'function') renderWater();
      }
      
      // Sync language data
      console.log('[Sync] Fetching language data from Convex...');
      try {
        // Sync letter progress
        const letterProgress = await runQuery("language.getLetterProgress", { token });
        console.log('[Sync] Letter progress from Convex:', letterProgress?.length || 0);
        if (letterProgress && window.state) {
          const convexMastered = letterProgress.filter(lp => lp.mastered).map(lp => lp.letter);
          const localMastered = window.state.masteredLetters || [];
          // Union of both sets (keep all mastered letters from either source)
          const combinedSet = new Set([...localMastered, ...convexMastered]);
          const combinedArray = Array.from(combinedSet);
          // Only update if changed
          if (JSON.stringify(window.state.masteredLetters) !== JSON.stringify(combinedArray)) {
            window.state.masteredLetters = combinedArray;
            saveState();
            console.log('[Sync] Merged masteredLetters:', {
              local: localMastered.length,
              convex: convexMastered.length,
              combined: combinedArray.length
            });
            // Update UI if functions exist
            try {
              if (typeof window.updatePhaseProg === 'function') window.updatePhaseProg();
              if (typeof window.renderAlphaProgress === 'function') window.renderAlphaProgress();
              if (typeof window.renderBrowse === 'function' && document.getElementById('mode-browse') && (document.getElementById('mode-browse').style.display === 'block' || window.getComputedStyle(document.getElementById('mode-browse')).display === 'block')) {
                window.renderBrowse();
              }
            } catch (uiErr) {
              console.error('[Sync] Error updating UI:', uiErr);
            }
          } else {
            console.log('[Sync] masteredLetters unchanged:', {
              local: localMastered.length,
              convex: convexMastered.length,
              combined: combinedArray.length
            });
          }
        }
        
        // Sync vocab SRS - get ALL progress, not just due words
        const allVocabProgress = await runQuery("language.getAllVocabProgress", { token });
        console.log('[Sync] All vocab progress from Convex:', allVocabProgress?.length || 0);
        if (allVocabProgress && window.state) {
          // Update vocabSRS with data from Convex
          if (!window.state.vocabSRS) window.state.vocabSRS = {};
          allVocabProgress.forEach(word => {
            window.state.vocabSRS[word.wordId] = {
              level: word.level,
              nextReview: word.nextReview,
              correct: word.correct,
              wrong: word.wrong
            };
          });
          console.log('[Sync] Updated vocabSRS with', allVocabProgress.length, 'words');
        }
        
        // Sync language challenge answers
        const langChallenge = await runQuery("language.getLangChallengeForDate", { token, date: today });
        console.log('[Sync] Language challenge for today:', langChallenge);
        const langCorrectTotal = await runQuery("language.getLangCorrectTotal", { token });
        console.log('[Sync] Total correct language challenges from Convex:', langCorrectTotal);
        if (window.state) {
          // Update today's answered flag
          if (langChallenge) {
            window.state.langAnswered = true;
          }
          // Update total correct count from Convex (source of truth)
          window.state.langCorrect = langCorrectTotal || 0;
        }
        
        if (letterProgress || allVocabProgress || langChallenge) {
          saveState();
          console.log('[Sync] Language data saved');
          // Update phase progress UI
          try {
            if (typeof window.updatePhaseProg === 'function') window.updatePhaseProg();
            if (typeof window.renderAlphaProgress === 'function') window.renderAlphaProgress();
            if (typeof window.renderBrowse === 'function' && document.getElementById('mode-browse') && (document.getElementById('mode-browse').style.display === 'block' || window.getComputedStyle(document.getElementById('mode-browse')).display === 'block')) {
              window.renderBrowse();
            }
          } catch (uiErr) {
            console.error('[Sync] Error updating UI:', uiErr);
          }
        }
      } catch (langErr) {
        console.error('[Sync] Error syncing language data:', langErr);
      }
      
      // Sync stats
      const userData = await runQuery("users.getUserData", { token });
      if (userData && window.state) {
        window.state.streak = userData.currentStreak || 0;
        window.state.bestStreak = userData.bestStreak || 0;
        window.state.totalDays = userData.totalDays || 0;
        if (!window.state.totalPoints || window.state.totalPoints === 0) {
          window.state.totalPoints = userData.totalPoints || 0;
        }
        // Update water goal if available
        let waterGoalChanged = false;
        if (userData.waterGoal && window.WATER_GOAL !== userData.waterGoal) {
          window.WATER_GOAL = userData.waterGoal;
          waterGoalChanged = true;
        }
        saveState();
        if (typeof renderHeader === 'function') renderHeader();
        if (waterGoalChanged && typeof renderWater === 'function') renderWater();
      }
      
      console.log(`[Sync #${syncCount}] Complete`);
    } catch (e) {
      console.error('[Sync] Error:', e.message, e.stack);
    }
  }, 10000); // Sync every 10 seconds
}
function stopBackgroundSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
// Alias
function setupConvexSubscriptions() {
  startBackgroundSync();
}

// Auth button handlers - fixed
document.getElementById('tab-login').addEventListener('click', () => {
  document.getElementById('tab-login').classList.add('active');
  document.getElementById('tab-signup').classList.remove('active');
  document.getElementById('login-form').style.display = 'block';
  document.getElementById('signup-form').style.display = 'none';
  document.getElementById('auth-error').classList.remove('show');
});

document.getElementById('tab-signup').addEventListener('click', () => {
  document.getElementById('tab-signup').classList.add('active');
  document.getElementById('tab-login').classList.remove('active');
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('signup-form').style.display = 'block';
  document.getElementById('auth-error').classList.remove('show');
});

document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('auth-error');
  const btn = document.getElementById('btn-login');
  
  if (!email || !email.includes('@')) {
    errorEl.textContent = 'Please enter a valid email address';
    errorEl.classList.add('show');
    return;
  }
  
  if (!password) {
    errorEl.textContent = 'Please enter your password';
    errorEl.classList.add('show');
    return;
  }
  
  errorEl.classList.remove('show');
  btn.textContent = 'Signing in...';
  btn.disabled = true;
  
  const result = await logIn(email, password);
  
  if (result.success) {
    btn.textContent = 'Success!';
  } else {
    errorEl.textContent = result.message || 'Login failed';
    errorEl.classList.add('show');
    btn.textContent = 'Sign In';
    btn.disabled = false;
  }
});

document.getElementById('btn-signup').addEventListener('click', async () => {
  const name = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const errorEl = document.getElementById('auth-error');
  const btn = document.getElementById('btn-signup');
  
  if (!email || !email.includes('@')) {
    errorEl.textContent = 'Please enter a valid email address';
    errorEl.classList.add('show');
    return;
  }
  
  if (password.length < 6) {
    errorEl.textContent = 'Password must be at least 6 characters';
    errorEl.classList.add('show');
    return;
  }
  
  errorEl.classList.remove('show');
  btn.textContent = 'Creating account...';
  btn.disabled = true;
  
  const result = await signUp(email, password, name || undefined);
  
  if (result.success) {
    btn.textContent = 'Account created!';
  } else {
    errorEl.textContent = result.message || 'Sign up failed';
    errorEl.classList.add('show');
    btn.textContent = 'Create Account';
    btn.disabled = false;
  }
});

// Handle Enter key in auth forms
document.querySelectorAll('.auth-input').forEach(input => {
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const form = input.closest('.auth-form');
      const btn = form.querySelector('.auth-btn');
      if (btn) btn.click();
    }
  });
});

// ════════════════════════════════════
//  LEGACY RENDER FUNCTION (placeholder)
// ════════════════════════════════════

// This will be replaced by the actual renderAll from the original app
// Note: renderAll is defined in index.html and should not be overridden

// Start app initialization
console.log('Script starting...');
const loadingOverlay = document.getElementById('loading-overlay');
const authScreen = document.getElementById('auth-screen');
const onboardingContainer = document.getElementById('onboarding-container');
console.log('Elements found:', {
  loadingOverlay: !!loadingOverlay,
  authScreen: !!authScreen,
  onboardingContainer: !!onboardingContainer
});

// Keep loading overlay visible until auth is determined
loadingOverlay.style.display = 'flex';
authScreen.style.display = 'none';
window.addEventListener('error', (e) => console.error('Global error:', e.error));

// Debug helper to check habit sync status
window.checkHabitSync = () => {
  console.log('=== HABIT SYNC DIAGNOSTIC ===');
  console.log('window.habitIdMap:', window.habitIdMap);
  console.log('window.habitIdMap keys:', window.habitIdMap ? Object.keys(window.habitIdMap) : 'none');
  console.log('window.HABITS:', window.HABITS);
  console.log('window.userHabits:', window.userHabits);
  console.log('todayData.done keys:', window.todayData ? Object.keys(window.todayData.done) : 'no todayData');
  console.log('localStorage dailywins_habitIdMap:', localStorage.getItem('dailywins_habitIdMap'));
  console.log('localStorage dailywins_habits:', localStorage.getItem('dailywins_habits'));
  console.log('localStorage dailywins_token:', localStorage.getItem('dailywins_token') ? 'exists' : 'missing');
  
  if (window.habitIdMap && window.HABITS) {
    window.HABITS.forEach(h => {
      const convexId = window.habitIdMap[h.id];
      console.log(`Habit "${h.name}" (${h.id}) -> Convex ID: ${convexId || 'NO MAPPING'}`);
    });
  }
  console.log('=== END DIAGNOSTIC ===');
};

// Debug helper to force habit sync
window.forceHabitSync = async () => {
  const token = localStorage.getItem('dailywins_token');
  if (!token) {
    console.error('No token found');
    return;
  }
  console.log('Force habit sync starting...');
  const result = await ensureHabitsInConvex(token);
  console.log('Force habit sync result:', result);
  alert('Habit sync complete. Created: ' + result.created + ', existing: ' + result.existing);
};

// Debug helper to check letter sync status
window.checkLetterSync = () => {
  console.log('=== LETTER SYNC DIAGNOSTIC ===');
  console.log('window.state.masteredLetters:', window.state?.masteredLetters);
  console.log('localStorage dailywins_state:', localStorage.getItem('dailywins_state'));
  const token = localStorage.getItem('dailywins_token');
  console.log('Token present:', !!token);
  if (token && window.runQuery) {
    // Optionally fetch Convex data
    window.runQuery("language.getLetterProgress", { token }).then(progress => {
      console.log('Convex letter progress:', progress);
      const convexMastered = progress.filter(lp => lp.mastered).map(lp => lp.letter);
      console.log('Convex mastered letters:', convexMastered);
    }).catch(e => console.error('Failed to fetch Convex data:', e));
  }
  console.log('=== END DIAGNOSTIC ===');
};

initApp().catch(e => {
  console.error('Init error:', e);
  hideLoading();
  showAuth();
});
