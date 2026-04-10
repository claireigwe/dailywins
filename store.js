import { runMutation, runQuery } from "./convex-client.js";

const listeners = new Map();

function notify(key) {
  if (listeners.has(key)) {
    listeners.get(key).forEach((cb) => cb(store[key]));
  }
}

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

export function getState() {
  return store;
}

export function subscribeToState(key, callback) {
  if (!listeners.has(key)) {
    listeners.set(key, []);
  }
  listeners.get(key).push(callback);
  
  if (store[key] !== undefined) {
    callback(store[key]);
  }
  
  return () => {
    const subs = listeners.get(key);
    const index = subs.indexOf(callback);
    if (index > -1) subs.splice(index, 1);
  };
}

function updateState(key, value) {
  store[key] = value;
  notify(key);
}

export async function initStore() {
  updateState("loading", true);
  
  try {
    await loadUserData();
    await loadTodayData();
  } catch (error) {
    console.error("Failed to initialize store:", error);
  }
  
  updateState("loading", false);
}

export async function loadUserData() {
  try {
    const userData = await runQuery("users.getCurrentUser", {});
    updateState("user", userData);
    
    if (userData) {
      const stats = await runQuery("users.getStats", {});
      updateState("stats", stats);
      
      const streak = await runQuery("habits.getStreakInfo", {});
      updateState("streak", streak);
    }
  } catch (error) {
    console.error("Failed to load user data:", error);
  }
}

export async function loadTodayData() {
  try {
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
    console.error("Failed to load today data:", error);
  }
}

export async function toggleHabit(habitId) {
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    const result = await runMutation("habits.toggleHabit", { habitId, date: today });
    await loadTodayData();
    await loadUserData();
    return result;
  } catch (error) {
    console.error("Failed to toggle habit:", error);
    throw error;
  }
}

export async function createHabit(habit) {
  try {
    await runMutation("habits.createHabit", habit);
    await loadTodayData();
  } catch (error) {
    console.error("Failed to create habit:", error);
    throw error;
  }
}

export async function deleteHabit(habitId) {
  try {
    await runMutation("habits.deleteHabit", { habitId });
    await loadTodayData();
  } catch (error) {
    console.error("Failed to delete habit:", error);
    throw error;
  }
}

export async function createTask(text) {
  try {
    await runMutation("tasks.createTask", { text });
    await loadTodayData();
  } catch (error) {
    console.error("Failed to create task:", error);
    throw error;
  }
}

export async function toggleTask(taskId) {
  try {
    await runMutation("tasks.toggleTask", { taskId });
    await loadTodayData();
    await loadUserData();
  } catch (error) {
    console.error("Failed to toggle task:", error);
    throw error;
  }
}

export async function deleteTask(taskId) {
  try {
    await runMutation("tasks.deleteTask", { taskId });
    await loadTodayData();
    await loadUserData();
  } catch (error) {
    console.error("Failed to delete task:", error);
    throw error;
  }
}

export async function addWater() {
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    const result = await runMutation("water.addWater", { date: today });
    updateState("water", { glasses: result.glasses, goal: result.goal });
    return result;
  } catch (error) {
    console.error("Failed to add water:", error);
    throw error;
  }
}

export async function removeWater() {
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    const result = await runMutation("water.removeWater", { date: today });
    updateState("water", { glasses: result.glasses, goal: result.goal });
  } catch (error) {
    console.error("Failed to remove water:", error);
    throw error;
  }
}

export async function saveIntention(text) {
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    await runMutation("intentions.saveIntention", { date: today, text });
  } catch (error) {
    console.error("Failed to save intention:", error);
    throw error;
  }
}

export async function getIntention() {
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    return await runQuery("intentions.getIntention", { date: today });
  } catch (error) {
    console.error("Failed to get intention:", error);
    return "";
  }
}

export async function saveReflection(selectedOptions) {
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    await runMutation("reflections.saveReflection", { date: today, selectedOptions });
    await loadUserData();
  } catch (error) {
    console.error("Failed to save reflection:", error);
    throw error;
  }
}

export async function getReflection() {
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    return await runQuery("reflections.getReflection", { date: today });
  } catch (error) {
    console.error("Failed to get reflection:", error);
    return null;
  }
}

export async function answerLangChallenge(correct) {
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    await runMutation("language.logLangChallenge", { date: today, correct });
    await loadUserData();
  } catch (error) {
    console.error("Failed to log lang challenge:", error);
    throw error;
  }
}

export async function markLetterMastered(letter) {
  try {
    await runMutation("language.markLetterMastered", { letter });
    await loadUserData();
  } catch (error) {
    console.error("Failed to mark letter mastered:", error);
    throw error;
  }
}

export async function rateVocabWord(wordId, rating) {
  try {
    return await runMutation("language.rateVocabWord", { wordId, rating });
  } catch (error) {
    console.error("Failed to rate vocab word:", error);
    throw error;
  }
}

export async function getLangChallenge() {
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    return await runQuery("language.getLangChallengeForDate", { date: today });
  } catch (error) {
    console.error("Failed to get lang challenge:", error);
    return null;
  }
}

export async function getReflectionOptions() {
  try {
    return await runQuery("reflections.getReflectionOptions", {});
  } catch (error) {
    console.error("Failed to get reflection options:", error);
    return [];
  }
}

export async function getBadges() {
  try {
    return await runQuery("stats.getAllBadges", {});
  } catch (error) {
    console.error("Failed to get badges:", error);
    return [];
  }
}

export async function checkNewBadges() {
  try {
    return await runQuery("stats.checkBadges", {});
  } catch (error) {
    console.error("Failed to check badges:", error);
    return [];
  }
}

export async function getWeeklyStats() {
  try {
    return await runQuery("habits.getWeeklyStats", {});
  } catch (error) {
    console.error("Failed to get weekly stats:", error);
    return [];
  }
}

export async function getMonthStats(year, month) {
  try {
    return await runQuery("stats.getMonthStats", { year, month });
  } catch (error) {
    console.error("Failed to get month stats:", error);
    return [];
  }
}

export async function completeOnboarding(habits, waterGoal, language) {
  try {
    await runMutation("users.completeOnboarding", { habits, waterGoal, language });
    await loadUserData();
    await loadTodayData();
  } catch (error) {
    console.error("Failed to complete onboarding:", error);
    throw error;
  }
}

export async function migrateLocalStorage(localData) {
  try {
    return await runMutation("migration.migrateLocalStorage", { localData });
  } catch (error) {
    console.error("Failed to migrate local data:", error);
    throw error;
  }
}
