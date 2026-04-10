import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getIntention = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) return null;

    const intention = await ctx.db
      .query("intentions")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date)
      )
      .unique();

    return intention?.text ?? "";
  },
});

export const saveIntention = mutation({
  args: {
    date: v.string(),
    text: v.string(),
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
      .query("intentions")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        text: args.text,
      });
    } else {
      await ctx.db.insert("intentions", {
        userId: user._id,
        date: args.date,
        text: args.text,
        createdAt: Date.now(),
      });
    }

    return { success: true };
  },
});
