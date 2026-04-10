import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getDailyStats = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) return null;

    const stats = await ctx.db
      .query("dailyStats")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date)
      )
      .unique();

    if (stats) return stats;

    const habits = await ctx.db
      .query("habits")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const habitLogs = await ctx.db
      .query("habitLogs")
      .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", args.date))
      .collect();

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_done", (q) => q.eq("userId", user._id).eq("done", true))
      .collect();

    const waterLog = await ctx.db
      .query("waterLogs")
      .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", args.date))
      .unique();

    const reflection = await ctx.db
      .query("reflections")
      .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", args.date))
      .unique();

    const langLog = await ctx.db
      .query("langChallengeLogs")
      .withIndex("by_user_date", (q) => q.eq("userId", user._id).eq("date", args.date))
      .unique();

    return {
      habitsCompleted: habitLogs.length,
      totalHabits: habits.filter((h) => !h.archived).length,
      langCorrect: langLog?.correct ? 1 : 0,
      tasksCompleted: tasks.length,
      waterGlasses: waterLog?.glasses ?? 0,
      reflectionSaved: !!reflection,
    };
  },
});

export const getMonthStats = query({
  args: { year: v.number(), month: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) return [];

    const daysInMonth = new Date(args.year, args.month + 1, 0).getDate();
    const result = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${args.year}-${String(args.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      const stats = await ctx.db
        .query("dailyStats")
        .withIndex("by_user_date", (q) =>
          q.eq("userId", user._id).eq("date", date)
        )
        .unique();

      const habits = await ctx.db
        .query("habits")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();

      const habitLogs = await ctx.db
        .query("habitLogs")
        .withIndex("by_user_date", (q) =>
          q.eq("userId", user._id).eq("date", date)
        )
        .collect();

      const totalHabits = habits.filter((h) => !h.archived).length;

      if (stats) {
        result.push({
          date,
          ...stats,
        });
      } else if (habitLogs.length > 0 || totalHabits > 0) {
        result.push({
          date,
          habitsCompleted: habitLogs.length,
          totalHabits,
          langCorrect: 0,
          tasksCompleted: 0,
          waterGlasses: 0,
          reflectionSaved: false,
        });
      } else {
        result.push({
          date,
          habitsCompleted: 0,
          totalHabits,
          langCorrect: 0,
          tasksCompleted: 0,
          waterGlasses: 0,
          reflectionSaved: false,
        });
      }
    }

    return result;
  },
});

export const checkBadges = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) return [];

    const userBadges = await ctx.db
      .query("badges")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const letterProgress = await ctx.db
      .query("letterProgress")
      .withIndex("by_user_lang", (q) =>
        q.eq("userId", user._id).eq("language", user.language)
      )
      .collect();

    const langCorrectCount = await ctx.db
      .query("langChallengeLogs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const unlockedBadges = [];

    if (user.totalDays >= 1 && !userBadges.find((b) => b.badgeId === "first")) {
      unlockedBadges.push({ id: "first", name: "First Step", icon: "🌱" });
    }

    if (user.currentStreak >= 7 && !userBadges.find((b) => b.badgeId === "week")) {
      unlockedBadges.push({ id: "week", name: "On Fire", icon: "🔥" });
    }

    if (user.currentStreak >= 30 && !userBadges.find((b) => b.badgeId === "month")) {
      unlockedBadges.push({ id: "month", name: "Diamond", icon: "💎" });
    }

    const totalLangCorrect = langCorrectCount.filter((l) => l.correct).length;
    if (totalLangCorrect >= 20 && !userBadges.find((b) => b.badgeId === "scholar")) {
      unlockedBadges.push({ id: "scholar", name: "Scholar", icon: "🎓" });
    }

    const masteredCount = letterProgress.filter((l) => l.mastered).length;
    if (masteredCount >= 27 && !userBadges.find((b) => b.badgeId === "abc")) {
      unlockedBadges.push({ id: "abc", name: "Alphabet Hero", icon: "🔤" });
    }

    for (const badge of unlockedBadges) {
      await ctx.db.insert("badges", {
        userId: user._id,
        badgeId: badge.id,
        unlockedAt: Date.now(),
      });
    }

    return unlockedBadges;
  },
});

export const getAllBadges = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) return [];

    const userBadges = await ctx.db
      .query("badges")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const allBadges = [
      { id: "first", name: "First Step", icon: "🌱", requirement: "Complete day 1" },
      { id: "week", name: "On Fire", icon: "🔥", requirement: "7-day streak" },
      { id: "month", name: "Diamond", icon: "💎", requirement: "30-day streak" },
      { id: "scholar", name: "Scholar", icon: "🎓", requirement: "20 lang correct" },
      { id: "iron", name: "Iron Will", icon: "🏋️", requirement: "10 perfect days" },
      { id: "abc", name: "Alphabet Hero", icon: "🔤", requirement: "Master all 27 letters" },
    ];

    return allBadges.map((badge) => ({
      ...badge,
      unlocked: userBadges.some((ub) => ub.badgeId === badge.id),
    }));
  },
});
