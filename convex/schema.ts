import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Credentials table for email/password auth
  credentials: defineTable({
    userId: v.id("users"),
    email: v.string(),
    passwordHash: v.string(),
    sessionToken: v.string(),
    sessionExpiry: v.number(),
  }).index("by_email", ["email"]),

  // Users table - extended from Convex Auth
  users: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    onboardingComplete: v.boolean(),
    waterGoal: v.number(),
    language: v.string(),
    currentStreak: v.number(),
    bestStreak: v.number(),
    totalPoints: v.number(),
    totalDays: v.number(),
    createdAt: v.number(),
    lastActiveDate: v.optional(v.string()),
  }).index("by_email", ["email"]),

  // User settings / preferences
  userSettings: defineTable({
    userId: v.id("users"),
    reflectionOptions: v.array(v.string()),
    notificationEnabled: v.boolean(),
    soundEnabled: v.boolean(),
    wakeTime: v.optional(v.string()),
    theme: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  // Habits - user customizable
  habits: defineTable({
    userId: v.id("users"),
    name: v.string(),
    icon: v.string(),
    description: v.string(),
    points: v.number(),
    order: v.number(),
    archived: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_order", ["userId", "order"]),

  // Daily habit completions
  habitLogs: defineTable({
    userId: v.id("users"),
    habitId: v.id("habits"),
    date: v.string(), // YYYY-MM-DD
    completedAt: v.number(),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_habit_date", ["habitId", "date"]),

  // Tasks
  tasks: defineTable({
    userId: v.id("users"),
    text: v.string(),
    done: v.boolean(),
    points: v.number(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_done", ["userId", "done"]),

  // Daily intentions
  intentions: defineTable({
    userId: v.id("users"),
    date: v.string(),
    text: v.string(),
    createdAt: v.number(),
  })
    .index("by_user_date", ["userId", "date"]),

  // Water tracking
  waterLogs: defineTable({
    userId: v.id("users"),
    date: v.string(),
    glasses: v.number(),
    updatedAt: v.number(),
  }).index("by_user_date", ["userId", "date"]),

  // Daily reflections
  reflections: defineTable({
    userId: v.id("users"),
    date: v.string(),
    selectedOptions: v.array(v.string()),
    savedAt: v.number(),
  }).index("by_user_date", ["userId", "date"]),

  // Language learning - letter mastery
  letterProgress: defineTable({
    userId: v.id("users"),
    language: v.string(),
    letter: v.string(),
    mastered: v.boolean(),
    masteredAt: v.optional(v.number()),
  }).index("by_user_lang", ["userId", "language"]),

  // Language learning - vocabulary SRS data
  vocabProgress: defineTable({
    userId: v.id("users"),
    wordId: v.string(),
    level: v.number(),
    nextReview: v.number(),
    correct: v.number(),
    wrong: v.number(),
    lastReviewed: v.optional(v.number()),
  }).index("by_user_word", ["userId", "wordId"])
    .index("by_user_nextReview", ["userId", "nextReview"]),

  // Language learning - daily challenge progress
  langChallengeLogs: defineTable({
    userId: v.id("users"),
    date: v.string(),
    correct: v.boolean(),
    answeredAt: v.number(),
  }).index("by_user_date", ["userId", "date"]),

  // Badges / achievements
  badges: defineTable({
    userId: v.id("users"),
    badgeId: v.string(),
    unlockedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_badge", ["userId", "badgeId"]),

  // Daily stats summary (for calendar view)
  dailyStats: defineTable({
    userId: v.id("users"),
    date: v.string(),
    habitsCompleted: v.number(),
    totalHabits: v.number(),
    langCorrect: v.number(),
    tasksCompleted: v.number(),
    waterGlasses: v.number(),
    reflectionSaved: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_user_date", ["userId", "date"]),

  // Custom vocabulary (user-added words)
  customVocab: defineTable({
    userId: v.id("users"),
    language: v.string(),
    original: v.string(),
    translation: v.string(),
    phonetic: v.optional(v.string()),
    type: v.optional(v.string()),
    example: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user_lang", ["userId", "language"]),

  // User-created language challenge items
  customChallengeItems: defineTable({
    userId: v.id("users"),
    language: v.string(),
    question: v.string(),
    answer: v.string(),
    phonetic: v.optional(v.string()),
    hint: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user_lang", ["userId", "language"]),
});
