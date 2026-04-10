import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getHabits = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const credentials = await ctx.db.query("credentials").collect();
    const credential = credentials.find(
      (c: any) => c.sessionToken === args.token
    );
    
    if (!credential) return [];
    if (credential.sessionExpiry < Date.now()) return [];
    
    const habits = await ctx.db
      .query("habits")
      .withIndex("by_user", (q) => q.eq("userId", credential.userId))
      .collect();

    return habits.filter((h) => !h.archived).sort((a, b) => a.order - b.order);
  },
});

export const listHabits = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) return [];

    const habits = await ctx.db
      .query("habits")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    return habits.filter((h) => !h.archived).sort((a, b) => a.order - b.order);
  },
});

export const getHabitsForDate = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) return [];

    const habits = await ctx.db
      .query("habits")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const logs = await ctx.db
      .query("habitLogs")
      .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", args.date))
      .collect();

    const completedIds = new Set(logs.map((l) => l.habitId.toString()));

    return habits
      .filter((h) => !h.archived)
      .sort((a, b) => a.order - b.order)
      .map((habit) => ({
        ...habit,
        completed: completedIds.has(habit._id.toString()),
      }));
  },
});

export const createHabit = mutation({
  args: {
    name: v.string(),
    icon: v.string(),
    description: v.string(),
    points: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) throw new Error("User not found");

    const existingHabits = await ctx.db
      .query("habits")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const maxOrder = existingHabits.reduce((max, h) => Math.max(max, h.order), -1);

    const habitId = await ctx.db.insert("habits", {
      userId: user._id,
      name: args.name,
      icon: args.icon,
      description: args.description,
      points: args.points,
      order: maxOrder + 1,
      archived: false,
      createdAt: Date.now(),
    });

    return habitId;
  },
});

export const updateHabit = mutation({
  args: {
    habitId: v.id("habits"),
    name: v.optional(v.string()),
    icon: v.optional(v.string()),
    description: v.optional(v.string()),
    points: v.optional(v.number()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const habit = await ctx.db.get(args.habitId);
    if (!habit) throw new Error("Habit not found");

    await ctx.db.patch(args.habitId, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.icon !== undefined && { icon: args.icon }),
      ...(args.description !== undefined && { description: args.description }),
      ...(args.points !== undefined && { points: args.points }),
      ...(args.order !== undefined && { order: args.order }),
    });

    return { success: true };
  },
});

export const deleteHabit = mutation({
  args: { habitId: v.id("habits") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    await ctx.db.patch(args.habitId, { archived: true });

    return { success: true };
  },
});

export const toggleHabit = mutation({
  args: { habitId: v.id("habits"), date: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) throw new Error("User not found");

    const existingLog = await ctx.db
      .query("habitLogs")
      .withIndex("by_habit_date", (q) =>
        q.eq("habitId", args.habitId).eq("date", args.date)
      )
      .unique();

    if (existingLog) {
      await ctx.db.delete(existingLog._id);
      return { completed: false };
    } else {
      await ctx.db.insert("habitLogs", {
        userId: user._id,
        habitId: args.habitId,
        date: args.date,
        completedAt: Date.now(),
      });

      await ctx.db.patch(user._id, {
        totalPoints: user.totalPoints + 20,
      });

      return { completed: true, points: 20 };
    }
  },
});

export const reorderHabits = mutation({
  args: {
    habitIds: v.array(v.id("habits")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    for (let i = 0; i < args.habitIds.length; i++) {
      await ctx.db.patch(args.habitIds[i], { order: i });
    }

    return { success: true };
  },
});

export const getStreakInfo = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) return null;

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const todayHabits = await ctx.db
      .query("habits")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const todayLogs = await ctx.db
      .query("habitLogs")
      .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", today))
      .collect();

    const completedToday = todayLogs.length;
    const totalHabits = todayHabits.filter((h) => !h.archived).length;

    return {
      currentStreak: user.currentStreak,
      bestStreak: user.bestStreak,
      completedToday,
      totalHabits,
      allComplete: completedToday === totalHabits && totalHabits > 0,
    };
  },
});

export const getWeeklyStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) return [];

    const result = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const dayStats = await ctx.db
        .query("dailyStats")
        .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", date))
        .unique();

      const logs = await ctx.db
        .query("habitLogs")
        .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", date))
        .collect();

      result.push({
        date,
        habitsCompleted: logs.length,
      });
    }

    return result;
  },
});
