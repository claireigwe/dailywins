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
    }, 10000);
    
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
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function initAuth() {
  if (convexInitialized) return isConnected();
  const success = await initConvex();
  convexInitialized = true;
  return success;
}

async function runMutation(mutationPath, args) {
  if (!convexClient || !api) throw new Error('Convex not connected');
  const [module, func] = mutationPath.split(".");
  const mutation = api[module]?.[func];
  if (!mutation) throw new Error(`Mutation ${mutationPath} not found`);
  return convexClient.mutation(mutation, args || {});
}

async function runQuery(queryPath, args) {
  if (!convexClient || !api) throw new Error('Convex not connected');
  const [module, func] = queryPath.split(".");
  const query = api[module]?.[func];
  if (!query) throw new Error(`Query ${queryPath} not found`);
  return convexClient.query(query, args || {});
}

async function checkAuth() {
  if (!convexInitialized) {
    await initAuth();
  }
  
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
      authState = user.onboardingComplete ? AUTH_STATES.LOGGED_IN : AUTH_STATES.ONBOARDING;
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
  
  storeToken(null);
  currentUser = null;
  authState = AUTH_STATES.LOGGED_OUT;
  notifyAuthChange();
  return { success: true };
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

async function toggleTask(taskId) {
  await runMutation("tasks.toggleTask", { taskId });
  await initStore();
}

async function addWater() {
  const today = new Date().toISOString().slice(0, 10);
  const result = await runMutation("water.addWater", { date: today });
  updateState("water", { glasses: result.glasses, goal: result.goal });
  return result;
}

async function removeWater() {
  const today = new Date().toISOString().slice(0, 10);
  const result = await runMutation("water.removeWater", { date: today });
  updateState("water", { glasses: result.glasses, goal: result.goal });
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
  await runMutation("language.markLetterMastered", { letter });
  await initStore();
}

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
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Auth check timeout')), 10000)
    );
    
    const authPromise = checkAuth();
    const { state, user } = await Promise.race([authPromise, timeoutPromise]);
    console.log('Auth checked, state:', state, 'user:', user);
    
    hideLoading();
    
    if (state === AUTH_STATES.LOGGED_OUT || state === AUTH_STATES.OFFLINE) {
      showAuth();
      return;
    }
    
    if (state === AUTH_STATES.ONBOARDING) {
      const container = document.getElementById('onboarding-container');
      if (container) container.style.display = 'block';
      renderOnboarding(container);
      return;
    }
    
    if (state === AUTH_STATES.LOGGED_IN && user) {
      const screen = document.getElementById('auth-screen');
      if (screen) screen.style.display = 'none';
      // Load user data and render
      await loadUserDataFromConvex();
      if (typeof renderHabits === 'function') renderHabits();
      if (typeof renderWater === 'function') renderWater();
      if (typeof renderHeader === 'function') renderHeader();
      if (typeof renderLang === 'function') renderLang();
      appInitialized = true;
      return;
    }
    
    showAuth();
  } catch (error) {
    console.error('App initialization error:', error);
    hideLoading();
    showAuth();
  }
}

// Listen for auth changes
onAuthChange((state, user) => {
  console.log('Auth state changed:', state, 'user:', user);
  const authScreen = document.getElementById('auth-screen');
  const onboardingContainer = document.getElementById('onboarding-container');
  
  if (state === AUTH_STATES.LOGGED_OUT || state === AUTH_STATES.OFFLINE) {
    console.log('Showing auth screen');
    authScreen.style.display = 'flex';
    if (onboardingContainer) onboardingContainer.style.display = 'none';
    appInitialized = false;
  }
  
  if (state === AUTH_STATES.ONBOARDING) {
    console.log('Showing onboarding');
    authScreen.style.display = 'none';
    if (onboardingContainer) {
      onboardingContainer.style.display = 'block';
      console.log('Onboarding container display set to block');
      renderOnboarding(onboardingContainer);
    }
  }
  
  if (state === AUTH_STATES.LOGGED_IN) {
    console.log('User logged in, initializing app');
    authScreen.style.display = 'none';
    if (onboardingContainer) onboardingContainer.style.display = 'none';
    if (!appInitialized) {
      loadUserDataFromConvex().then(() => {
        // Call render functions from index.html scope
        if (typeof renderHabits === 'function') renderHabits();
        if (typeof renderWater === 'function') renderWater();
        if (typeof renderHeader === 'function') renderHeader();
        if (typeof renderLang === 'function') renderLang();
        appInitialized = true;
      });
    }
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
    if (!user) return;
    
    if (typeof state !== 'undefined') {
      state.streak = user.currentStreak || 0;
      state.bestStreak = user.bestStreak || 0;
      state.totalPoints = user.totalPoints || 0;
      state.totalDays = user.totalDays || 0;
      state.settings = state.settings || {};
      state.settings.lang = user.language || 'spanish';
      console.log('State updated');
    }
    
    console.log('Fetching habits...');
    const habits = await runQuery("habits.getHabits", { token });
    console.log('Habits from Convex:', habits);
    
    // Update HABITS in the main page scope
    window.userHabits = habits || [];
    window.WATER_GOAL = user.waterGoal || 8;
    console.log('WATER_GOAL set to:', window.WATER_GOAL);
    
    console.log('loadUserDataFromConvex complete');
  } catch (error) {
    console.error('Failed to load user data:', error);
  }
}

// Note: render functions are now called directly after loadUserDataFromConvex()
  });
}

// Auth button handlers
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
// For now, we show the auth screen
function renderAll() {
  console.log('App initialized with Convex');
}

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

loadingOverlay.style.display = 'none';
authScreen.style.display = 'flex';
window.addEventListener('error', (e) => console.error('Global error:', e.error));
initApp().catch(e => console.error('Init error:', e));
