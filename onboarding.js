import { completeOnboarding, migrateLocalStorage } from "./store.js";

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
  learning: {
    name: "Language Learning",
    emoji: "🌍",
    habits: [
      { name: "Practice vocabulary", icon: "📝", description: "Review and learn new words", points: 20 },
      { name: "Listen to target language", icon: "🎧", description: "Podcasts, music, or videos", points: 15 },
      { name: "Speak or write", icon: "💬", description: "Practice speaking or writing in the language", points: 25 },
      { name: "Review flashcards", icon: "🃏", description: "Spaced repetition review", points: 15 },
    ],
  },
  fitness: {
    name: "Fitness",
    emoji: "🏋️",
    habits: [
      { name: "Work out", icon: "💪", description: "Any exercise - gym, running, yoga", points: 30 },
      { name: "Track nutrition", icon: "🥘", description: "Log your meals or hit macros", points: 20 },
      { name: "Morning stretch", icon: "🌅", description: "5-10 minutes of stretching", points: 15 },
      { name: "Walk 10,000 steps", icon: "🚶", description: "Stay active throughout the day", points: 20 },
    ],
  },
  mindfulness: {
    name: "Mindfulness",
    emoji: "🧘",
    habits: [
      { name: "Meditate for 10 minutes", icon: "🧘", description: "Practice mindfulness meditation", points: 20 },
      { name: "Journal", icon: "📓", description: "Write down thoughts and gratitude", points: 15 },
      { name: "Digital detox hour", icon: "📵", description: "No screens for at least one hour", points: 15 },
      { name: "Connect with someone", icon: "💬", description: "Call or spend time with a loved one", points: 20 },
    ],
  },
};

const LANGUAGES = [
  { code: "spanish", name: "Spanish", flag: "🇪🇸" },
  { code: "french", name: "French", flag: "🇫🇷" },
  { code: "german", name: "German", flag: "🇩🇪" },
  { code: "japanese", name: "Japanese", flag: "🇯🇵" },
  { code: "yoruba", name: "Yoruba", flag: "🇳🇬" },
  { code: "none", name: "No language learning", flag: "❌" },
];

let currentStep = 0;
let selectedTemplate = null;
let customHabits = [];
let waterGoal = 8;
let selectedLanguage = "spanish";
let hasLocalData = false;

export function checkForLocalData() {
  try {
    const localData = localStorage.getItem("dw_state");
    if (localData) {
      const parsed = JSON.parse(localData);
      if (parsed.streak !== undefined || parsed.totalPoints !== undefined) {
        hasLocalData = true;
        return true;
      }
    }
  } catch (e) {
    console.error("Error checking local data:", e);
  }
  hasLocalData = false;
  return false;
}

export function renderOnboarding(container) {
  const localDataExists = checkForLocalData();
  
  container.innerHTML = `
    <div id="onboarding" class="onboarding">
      ${localDataExists ? renderMigrationPrompt() : renderStep(currentStep)}
    </div>
  `;
  
  if (localDataExists) {
    setupMigrationHandlers(container);
  } else {
    setupOnboardingHandlers(container);
  }
}

function renderMigrationPrompt() {
  return `
    <div class="onboarding-step active">
      <div class="onboarding-icon">🔄</div>
      <h2>Welcome Back!</h2>
      <p>We found your existing progress stored locally. Would you like to import it to your new account?</p>
      <div class="onboarding-actions">
        <button class="onboarding-btn primary" id="btn-import">Import My Progress</button>
        <button class="onboarding-btn secondary" id="btn-skip">Start Fresh</button>
      </div>
    </div>
  `;
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
    .map(
      ([key, template]) => `
      <div class="template-card" data-template="${key}">
        <div class="template-emoji">${template.emoji}</div>
        <div class="template-name">${template.name}</div>
      </div>
    `
    )
    .join("");
  
  const customCard = `
    <div class="template-card" data-template="custom">
      <div class="template-emoji">✨</div>
      <div class="template-name">Custom</div>
    </div>
  `;
  
  return `
    <div class="onboarding-step">
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
    </div>
  `;
}

function renderCustomizeStep() {
  if (selectedTemplate === "custom") {
    return `
      <div class="onboarding-step">
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
    .map(
      (habit, i) => `
      <label class="habit-checkbox">
        <input type="checkbox" data-habit="${i}" checked>
        <span class="habit-icon">${habit.icon}</span>
        <span class="habit-name">${habit.name}</span>
      </label>
    `
    )
    .join("");
  
  return `
    <div class="onboarding-step">
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
    <div class="onboarding-step">
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
  const languageOptions = LANGUAGES.map(
    (lang) => `
    <label class="language-option ${lang.code === selectedLanguage ? "selected" : ""}">
      <input type="radio" name="language" value="${lang.code}" ${lang.code === selectedLanguage ? "checked" : ""}>
      <span class="lang-flag">${lang.flag}</span>
      <span class="lang-name">${lang.name}</span>
    </label>
  `).join("");
  
  return `
    <div class="onboarding-step">
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
    <div class="onboarding-step">
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
  
  return customHabits
    .map(
      (habit, i) => `
      <div class="custom-habit-input">
        <input type="text" placeholder="Habit name" value="${habit.name}" data-field="name" data-index="${i}">
        <input type="text" placeholder="Icon (emoji)" value="${habit.icon}" data-field="icon" data-index="${i}" maxlength="2" class="icon-input">
        <button class="remove-habit" data-index="${i}">✕</button>
      </div>
    `
    )
    .join("");
}

function setupMigrationHandlers(container) {
  const btnImport = container.querySelector("#btn-import");
  const btnSkip = container.querySelector("#btn-skip");
  
  if (btnImport) {
    btnImport.addEventListener("click", async () => {
      btnImport.textContent = "Importing...";
      btnImport.disabled = true;
      
      try {
        const localData = localStorage.getItem("dw_state");
        await migrateLocalStorage(localData);
        window.location.reload();
      } catch (error) {
        console.error("Migration failed:", error);
        btnImport.textContent = "Import Failed - Try Again";
        btnImport.disabled = false;
      }
    });
  }
  
  if (btnSkip) {
    btnSkip.addEventListener("click", () => {
      currentStep = 1;
      container.innerHTML = `<div id="onboarding">${renderStep(currentStep)}</div>`;
      setupOnboardingHandlers(container);
    });
  }
}

function setupOnboardingHandlers(container) {
  const btnNext = container.querySelector("#btn-next");
  const btnBack = container.querySelector("#btn-back");
  const btnFinish = container.querySelector("#btn-finish");
  const btnStart = container.querySelector("#btn-start");
  const btnAddHabit = container.querySelector("#btn-add-habit");
  
  if (btnNext) {
    btnNext.addEventListener("click", () => {
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
      
      if (currentStep === 3 && selectedTemplate !== "custom") {
        const checked = container.querySelectorAll('input[type="checkbox"]:checked');
        const templateHabits = TEMPLATES[selectedTemplate].habits;
        customHabits = Array.from(checked).map((cb) => {
          const idx = parseInt(cb.dataset.habit);
          return templateHabits[idx];
        });
      }
      
      currentStep++;
      container.innerHTML = `<div id="onboarding">${renderStep(currentStep)}</div>`;
      setupOnboardingHandlers(container);
    });
  }
  
  if (btnBack) {
    btnBack.addEventListener("click", () => {
      currentStep--;
      container.innerHTML = `<div id="onboarding">${renderStep(currentStep)}</div>`;
      setupOnboardingHandlers(container);
    });
  }
  
  if (btnFinish || btnStart) {
    const btn = btnFinish || btnStart;
    btn.addEventListener("click", async () => {
      btn.textContent = "Setting up...";
      btn.disabled = true;
      
      try {
        if (selectedTemplate === "custom") {
          const inputs = container.querySelectorAll(".custom-habit-input");
          customHabits = Array.from(inputs).map((input) => ({
            name: input.querySelector('[data-field="name"]').value,
            icon: input.querySelector('[data-field="icon"]').value || "✅",
            description: "",
            points: 20,
          })).filter((h) => h.name.trim());
        }
        
        await completeOnboarding(customHabits, waterGoal, selectedLanguage);
        
        if (btnFinish) {
          window.location.reload();
        } else {
          window.location.reload();
        }
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
  
  container.querySelectorAll(".custom-habit-input input").forEach((input) => {
    input.addEventListener("input", (e) => {
      const index = parseInt(e.target.dataset.index);
      const field = e.target.dataset.field;
      customHabits[index][field] = e.target.value;
    });
  });
}
