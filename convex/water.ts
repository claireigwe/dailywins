import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getUserIdFromToken } from "./auth";

async function getUserFromToken(ctx: any, token: string) {
  console.log("getUserFromToken called with token:", token?.substring(0, 20) + "...");
  
  const userId = await getUserIdFromToken(ctx, token);
  if (!userId) {
    console.log("Invalid or expired token");
    return null;
  }
  
  const user = await ctx.db.get(userId);
  console.log("Found user:", user?._id);
  return user;
}

export const getWaterLog = query({
  args: { token: v.string(), date: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) return { glasses: 0, goal: 8 };

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
  args: { token: v.string(), date: v.string() },
  handler: async (ctx, args) => {
    console.log("addWater called with:", JSON.stringify(args));
    
    const user = await getUserFromToken(ctx, args.token);
    console.log("User from token:", user?._id);
    
    if (!user) throw new Error("Invalid session - user not found for token");

    const existing = await ctx.db
      .query("waterLogs")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date)
      )
      .unique();
    
    console.log("Existing water log:", existing?._id);

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

    console.log("addWater success, glasses:", newGlasses);
    return {
      glasses: newGlasses,
      goal: user.waterGoal,
      goalReached,
      goalExceeded,
    };
  },
});

export const removeWater = mutation({
  args: { token: v.string(), date: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Invalid session");

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
  args: { token: v.string(), date: v.string(), glasses: v.number() },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Invalid session");

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
