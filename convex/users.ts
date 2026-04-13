import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getUserIdFromToken } from "./auth";

export const getUserData = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserIdFromToken(ctx, args.token);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    return {
      currentStreak: user.currentStreak,
      bestStreak: user.bestStreak,
      totalPoints: user.totalPoints,
      totalDays: user.totalDays,
      language: user.language,
      waterGoal: user.waterGoal,
      onboardingComplete: user.onboardingComplete,
      name: user.name,
    };
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    return user;
  },
});

export const getUserSettings = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserIdFromToken(ctx, args.token);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    return { user, settings };
  },
});

export const createUser = mutation({
  args: {
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (existing) return existing._id;

    const userId = await ctx.db.insert("users", {
      email: identity.email!,
      name: args.name || identity.name || null,
      imageUrl: args.imageUrl || identity.pictureUrl || null,
      onboardingComplete: false,
      waterGoal: 8,
      language: "spanish",
      currentStreak: 0,
      bestStreak: 0,
      totalPoints: 0,
      totalDays: 0,
      createdAt: Date.now(),
    });

    await ctx.db.insert("userSettings", {
      userId,
      reflectionOptions: [
        "💪 Worked out",
        "🌅 Woke up early",
        "🥗 Ate well",
        "💧 Stayed hydrated",
        "📚 Studied",
        "✅ Cleared my tasks",
        "😴 Slept well",
        "🧘 Stayed calm",
      ],
      notificationEnabled: false,
      soundEnabled: true,
    });

    return userId;
  },
});

export const completeOnboarding = mutation({
  args: {
    token: v.string(),
    habits: v.array(
      v.object({
        name: v.string(),
        icon: v.string(),
        description: v.string(),
        points: v.number(),
      })
    ),
    waterGoal: v.number(),
    language: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getUserIdFromToken(ctx, args.token);
    if (!userId) throw new Error("Invalid session");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, {
      onboardingComplete: true,
      waterGoal: args.waterGoal,
      language: args.language,
    });

    for (let i = 0; i < args.habits.length; i++) {
      const habit = args.habits[i];
      await ctx.db.insert("habits", {
        userId: user._id,
        name: habit.name,
        icon: habit.icon,
        description: habit.description,
        points: habit.points,
        order: i,
        archived: false,
        createdAt: Date.now(),
      });
    }

    return { success: true };
  },
});

export const updateUserSettings = mutation({
  args: {
    token: v.string(),
    waterGoal: v.optional(v.number()),
    language: v.optional(v.string()),
    reflectionOptions: v.optional(v.array(v.string())),
    notificationEnabled: v.optional(v.boolean()),
    soundEnabled: v.optional(v.boolean()),
    wakeTime: v.optional(v.string()),
    theme: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserIdFromToken(ctx, args.token);
    if (!userId) throw new Error("Invalid session");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    if (args.waterGoal !== undefined || args.language !== undefined) {
      await ctx.db.patch(user._id, {
        ...(args.waterGoal !== undefined && { waterGoal: args.waterGoal }),
        ...(args.language !== undefined && { language: args.language }),
      });
    }

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (settings) {
      await ctx.db.patch(settings._id, {
        ...(args.reflectionOptions !== undefined && { reflectionOptions: args.reflectionOptions }),
        ...(args.notificationEnabled !== undefined && { notificationEnabled: args.notificationEnabled }),
        ...(args.soundEnabled !== undefined && { soundEnabled: args.soundEnabled }),
        ...(args.wakeTime !== undefined && { wakeTime: args.wakeTime }),
        ...(args.theme !== undefined && { theme: args.theme }),
      });
    }

    return { success: true };
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) return null;

    const masteredLetters = await ctx.db
      .query("letterProgress")
      .withIndex("by_user_lang", (q) => q.eq("userId", user._id).eq("language", user.language))
      .collect();

    return {
      currentStreak: user.currentStreak,
      bestStreak: user.bestStreak,
      totalPoints: user.totalPoints,
      totalDays: user.totalDays,
      lettersMastered: masteredLetters.filter((l) => l.mastered).length,
      totalLetters: 27,
    };
  },
});

export const addPoints = mutation({
  args: { points: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, {
      totalPoints: user.totalPoints + args.points,
    });

    return { newTotal: user.totalPoints + args.points };
  },
});

export const updateStreak = mutation({
  args: { increment: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) throw new Error("User not found");

    const today = new Date().toISOString().slice(0, 10);

    if (args.increment) {
      const newStreak = user.currentStreak + 1;
      await ctx.db.patch(user._id, {
        currentStreak: newStreak,
        bestStreak: Math.max(user.bestStreak, newStreak),
        lastActiveDate: today,
        totalDays: user.totalDays + 1,
      });
    } else {
      await ctx.db.patch(user._id, {
        currentStreak: 0,
        lastActiveDate: today,
      });
    }

    return { success: true };
  },
});

export const resetUserData = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserIdFromToken(ctx, args.token);
    if (!userId) throw new Error("Invalid session");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Reset user fields
    await ctx.db.patch(user._id, {
      currentStreak: 0,
      bestStreak: 0,
      totalPoints: 0,
      totalDays: 0,
      waterGoal: 8,
      language: "spanish",
      onboardingComplete: false,
      lastActiveDate: null,
    });

    // Delete user's habits
    const habits = await ctx.db
      .query("habits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const habit of habits) {
      await ctx.db.delete(habit._id);
    }

    // Delete habit logs
    const habitLogs = await ctx.db
      .query("habitLogs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const log of habitLogs) {
      await ctx.db.delete(log._id);
    }

    // Delete tasks
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const task of tasks) {
      await ctx.db.delete(task._id);
    }

    // Delete water logs
    const waterLogs = await ctx.db
      .query("waterLogs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const log of waterLogs) {
      await ctx.db.delete(log._id);
    }

    // Delete badges
    const badges = await ctx.db
      .query("badges")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const badge of badges) {
      await ctx.db.delete(badge._id);
    }

    // Delete letter progress
    const letterProgress = await ctx.db
      .query("letterProgress")
      .withIndex("by_user_lang", (q) => q.eq("userId", userId))
      .collect();
    for (const progress of letterProgress) {
      await ctx.db.delete(progress._id);
    }

    // Delete vocab progress
    const vocabProgress = await ctx.db
      .query("vocabProgress")
      .withIndex("by_user_word", (q) => q.eq("userId", userId))
      .collect();
    for (const progress of vocabProgress) {
      await ctx.db.delete(progress._id);
    }

    // Delete language challenge logs
    const langChallengeLogs = await ctx.db
      .query("langChallengeLogs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const log of langChallengeLogs) {
      await ctx.db.delete(log._id);
    }

    // Delete daily stats
    const dailyStats = await ctx.db
      .query("dailyStats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const stats of dailyStats) {
      await ctx.db.delete(stats._id);
    }

    // Delete intentions
    const intentions = await ctx.db
      .query("intentions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const intention of intentions) {
      await ctx.db.delete(intention._id);
    }

    // Delete custom vocab
    const customVocab = await ctx.db
      .query("customVocab")
      .withIndex("by_user_lang", (q) => q.eq("userId", userId))
      .collect();
    for (const vocab of customVocab) {
      await ctx.db.delete(vocab._id);
    }

    // Delete custom challenge items
    const customChallengeItems = await ctx.db
      .query("customChallengeItems")
      .withIndex("by_user_lang", (q) => q.eq("userId", userId))
      .collect();
    for (const item of customChallengeItems) {
      await ctx.db.delete(item._id);
    }

    // Note: reflections table not used in this version, but we can leave them

    // Keep userSettings (but reset to defaults maybe?)
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (settings) {
      await ctx.db.patch(settings._id, {
        reflectionOptions: [
          "💪 Worked out",
          "🌅 Woke up early",
          "🥗 Ate well",
          "💧 Stayed hydrated",
          "📚 Studied",
          "✅ Cleared my tasks",
          "😴 Slept well",
          "🧘 Stayed calm",
        ],
        notificationEnabled: false,
        soundEnabled: true,
        wakeTime: null,
        theme: null,
      });
    }

    return { success: true };
  },
});
