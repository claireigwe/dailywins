import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

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
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) return null;

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
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
    const credentials = await ctx.db.query("credentials").collect();
    const credential = credentials.find(
      (c: any) => c.sessionToken === args.token
    );
    
    if (!credential) {
      throw new Error("Invalid session");
    }
    
    if (credential.sessionExpiry < Date.now()) {
      throw new Error("Session expired");
    }
    
    const user = await ctx.db.get(credential.userId);
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
    waterGoal: v.optional(v.number()),
    language: v.optional(v.string()),
    reflectionOptions: v.optional(v.array(v.string())),
    notificationEnabled: v.optional(v.boolean()),
    soundEnabled: v.optional(v.boolean()),
    wakeTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) throw new Error("User not found");

    if (args.waterGoal !== undefined || args.language !== undefined) {
      await ctx.db.patch(user._id, {
        ...(args.waterGoal !== undefined && { waterGoal: args.waterGoal }),
        ...(args.language !== undefined && { language: args.language }),
      });
    }

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    if (settings) {
      await ctx.db.patch(settings._id, {
        ...(args.reflectionOptions !== undefined && { reflectionOptions: args.reflectionOptions }),
        ...(args.notificationEnabled !== undefined && { notificationEnabled: args.notificationEnabled }),
        ...(args.soundEnabled !== undefined && { soundEnabled: args.soundEnabled }),
        ...(args.wakeTime !== undefined && { wakeTime: args.wakeTime }),
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
