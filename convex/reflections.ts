import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getUserIdFromToken } from "./auth";

export const getReflection = query({
  args: { token: v.string(), date: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserIdFromToken(ctx, args.token);
    if (!userId) return null;

    const reflection = await ctx.db
      .query("reflections")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).eq("date", args.date)
      )
      .unique();

    return reflection;
  },
});

export const saveReflection = mutation({
  args: {
    token: v.string(),
    date: v.string(),
    selectedOptions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserIdFromToken(ctx, args.token);
    if (!userId) throw new Error("Invalid session");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const existing = await ctx.db
      .query("reflections")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).eq("date", args.date)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        selectedOptions: args.selectedOptions,
        savedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("reflections", {
        userId,
        date: args.date,
        selectedOptions: args.selectedOptions,
        savedAt: Date.now(),
      });
    }

    await ctx.db.patch(user._id, {
      totalPoints: user.totalPoints + 10,
    });

    return { success: true };
  },
});

export const getReflectionOptions = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserIdFromToken(ctx, args.token);
    if (!userId) return [];

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    return settings?.reflectionOptions ?? [];
  },
});

export const updateReflectionOptions = mutation({
  args: { token: v.string(), options: v.array(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getUserIdFromToken(ctx, args.token);
    if (!userId) throw new Error("Invalid session");

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (settings) {
      await ctx.db.patch(settings._id, {
        reflectionOptions: args.options,
      });
    }

    return { success: true };
  },
});
