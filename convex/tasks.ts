import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

async function getUserFromToken(ctx: any, token: string) {
  const credentials = await ctx.db.query("credentials").collect();
  const credential = credentials.find((c: any) => c.sessionToken === token);
  if (!credential) return null;
  if (credential.sessionExpiry < Date.now()) return null;
  return await ctx.db.get(credential.userId);
}

export const listTasks = query({
  args: { token: v.string(), date: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) return [];

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Filter: recurring tasks OR tasks scheduled for today
    const today = args.date;
    return tasks
      .filter(t => t.recurring || t.scheduledDate === today)
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return b.createdAt - a.createdAt;
      });
  },
});

export const createTask = mutation({
  args: { token: v.string(), text: v.string(), scheduleType: v.union(v.literal("today"), v.literal("tomorrow")) },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Invalid session");

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const scheduledDate = args.scheduleType === "today" 
      ? today.toISOString().slice(0, 10)
      : tomorrow.toISOString().slice(0, 10);

    const taskId = await ctx.db.insert("tasks", {
      userId: user._id,
      text: args.text,
      done: false,
      points: 10,
      recurring: false,
      scheduledDate,
      createdAt: Date.now(),
    });

    return taskId;
  },
});

export const createRecurringTask = mutation({
  args: { token: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Invalid session");

    const taskId = await ctx.db.insert("tasks", {
      userId: user._id,
      text: args.text,
      done: false,
      points: 10,
      recurring: true,
      scheduledDate: undefined,
      createdAt: Date.now(),
    });

    return taskId;
  },
});

export const toggleTask = mutation({
  args: { token: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Invalid session");

    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    const newDoneState = !task.done;

    await ctx.db.patch(args.taskId, {
      done: newDoneState,
      ...(newDoneState && { completedAt: Date.now() }),
    });

    if (newDoneState) {
      await ctx.db.patch(user._id, {
        totalPoints: user.totalPoints + 10,
      });
    } else {
      await ctx.db.patch(user._id, {
        totalPoints: Math.max(0, user.totalPoints - 10),
      });
    }

    return { done: newDoneState };
  },
});

export const deleteTask = mutation({
  args: { token: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Invalid session");

    const task = await ctx.db.get(args.taskId);
    if (task && task.done) {
      await ctx.db.patch(user._id, {
        totalPoints: Math.max(0, user.totalPoints - 10),
      });
    }

    await ctx.db.delete(args.taskId);

    return { success: true };
  },
});
