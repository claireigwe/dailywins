import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listTasks = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) return [];

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    return tasks.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return b.createdAt - a.createdAt;
    });
  },
});

export const createTask = mutation({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) throw new Error("User not found");

    const taskId = await ctx.db.insert("tasks", {
      userId: user._id,
      text: args.text,
      done: false,
      points: 5,
      createdAt: Date.now(),
    });

    return taskId;
  },
});

export const toggleTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) throw new Error("User not found");

    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    const newDoneState = !task.done;

    await ctx.db.patch(args.taskId, {
      done: newDoneState,
      ...(newDoneState && { completedAt: Date.now() }),
    });

    if (newDoneState) {
      await ctx.db.patch(user._id, {
        totalPoints: user.totalPoints + 5,
      });
    } else {
      await ctx.db.patch(user._id, {
        totalPoints: Math.max(0, user.totalPoints - 5),
      });
    }

    return { done: newDoneState };
  },
});

export const deleteTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const task = await ctx.db.get(args.taskId);
    if (task && task.done) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", identity.email!))
        .unique();

      if (user) {
        await ctx.db.patch(user._id, {
          totalPoints: Math.max(0, user.totalPoints - 5),
        });
      }
    }

    await ctx.db.delete(args.taskId);

    return { success: true };
  },
});

export const clearCompletedTasks = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) throw new Error("User not found");

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_done", (q) => q.eq("userId", user._id).eq("done", true))
      .collect();

    for (const task of tasks) {
      await ctx.db.delete(task._id);
    }

    return { deleted: tasks.length };
  },
});
