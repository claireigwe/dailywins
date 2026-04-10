import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getWaterLog = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) return null;

    const log = await ctx.db
      .query("waterLogs")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date)
      )
      .unique();

    return {
      glasses: log?.glasses ?? 0,
      goal: user.waterGoal,
    };
  },
});

export const addWater = mutation({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) throw new Error("User not found");

    const existing = await ctx.db
      .query("waterLogs")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date)
      )
      .unique();

    const newGlasses = (existing?.glasses ?? 0) + 1;
    const goalReached = newGlasses === user.waterGoal;
    const goalExceeded = newGlasses > user.waterGoal;

    if (existing) {
      await ctx.db.patch(existing._id, {
        glasses: newGlasses,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("waterLogs", {
        userId: user._id,
        date: args.date,
        glasses: newGlasses,
        updatedAt: Date.now(),
      });
    }

    return {
      glasses: newGlasses,
      goal: user.waterGoal,
      goalReached,
      goalExceeded,
    };
  },
});

export const removeWater = mutation({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) throw new Error("User not found");

    const existing = await ctx.db
      .query("waterLogs")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date)
      )
      .unique();

    if (!existing || existing.glasses <= 0) {
      return { glasses: 0, goal: user.waterGoal };
    }

    await ctx.db.patch(existing._id, {
      glasses: existing.glasses - 1,
      updatedAt: Date.now(),
    });

    return {
      glasses: existing.glasses - 1,
      goal: user.waterGoal,
    };
  },
});

export const setWaterGlasses = mutation({
  args: { date: v.string(), glasses: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) throw new Error("User not found");

    const existing = await ctx.db
      .query("waterLogs")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        glasses: args.glasses,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("waterLogs", {
        userId: user._id,
        date: args.date,
        glasses: args.glasses,
        updatedAt: Date.now(),
      });
    }

    return {
      glasses: args.glasses,
      goal: user.waterGoal,
      goalReached: args.glasses >= user.waterGoal,
    };
  },
});
