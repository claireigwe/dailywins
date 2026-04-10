import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getReflection = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) return null;

    const reflection = await ctx.db
      .query("reflections")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date)
      )
      .unique();

    return reflection;
  },
});

export const saveReflection = mutation({
  args: {
    date: v.string(),
    selectedOptions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) throw new Error("User not found");

    const existing = await ctx.db
      .query("reflections")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        selectedOptions: args.selectedOptions,
        savedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("reflections", {
        userId: user._id,
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
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) return [];

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    return settings?.reflectionOptions ?? [];
  },
});

export const updateReflectionOptions = mutation({
  args: { options: v.array(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) throw new Error("User not found");

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    if (settings) {
      await ctx.db.patch(settings._id, {
        reflectionOptions: args.options,
      });
    }

    return { success: true };
  },
});
