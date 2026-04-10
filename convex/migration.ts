import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const migrateLocalStorage = mutation({
  args: {
    localData: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) throw new Error("User not found");

    try {
      const data = JSON.parse(args.localData);
      let migrated = {
        habits: 0,
        tasks: 0,
        points: 0,
        streak: 0,
        days: 0,
      };

      if (data.streak !== undefined) {
        migrated.streak = data.streak;
        migrated.points = data.totalPoints ?? 0;
        migrated.days = data.totalDays ?? 0;
        migrated.tasks = (data.tasks ?? []).length;

        await ctx.db.patch(user._id, {
          currentStreak: data.streak ?? 0,
          bestStreak: data.bestStreak ?? data.streak ?? 0,
          totalPoints: data.totalPoints ?? 0,
          totalDays: data.totalDays ?? 0,
        });
      }

      if (data.tasks && Array.isArray(data.tasks)) {
        for (const task of data.tasks) {
          await ctx.db.insert("tasks", {
            userId: user._id,
            text: task.text,
            done: task.done ?? false,
            points: 5,
            createdAt: task.id ?? Date.now(),
            completedAt: task.done ? Date.now() : undefined,
          });
          migrated.tasks++;
        }
      }

      if (data.masteredLetters && Array.isArray(data.masteredLetters)) {
        for (const letter of data.masteredLetters) {
          const existing = await ctx.db
            .query("letterProgress")
            .withIndex("by_user_lang", (q) =>
              q.eq("userId", user._id)
                .eq("language", user.language)
                .eq("letter", letter)
            )
            .unique();

          if (!existing) {
            await ctx.db.insert("letterProgress", {
              userId: user._id,
              language: user.language,
              letter,
              mastered: true,
              masteredAt: Date.now(),
            });
            migrated.habits++;
          }
        }
      }

      if (data.vocabSRS && typeof data.vocabSRS === "object") {
        for (const [wordId, srs] of Object.entries(data.vocabSRS)) {
          const srsData = srs as {
            level?: number;
            nextReview?: number;
            correct?: number;
            wrong?: number;
          };

          await ctx.db.insert("vocabProgress", {
            userId: user._id,
            wordId,
            level: srsData.level ?? 0,
            nextReview: srsData.nextReview ?? Date.now(),
            correct: srsData.correct ?? 0,
            wrong: srsData.wrong ?? 0,
            lastReviewed: Date.now(),
          });
        }
      }

      return {
        success: true,
        migrated,
        message: `Successfully imported ${migrated.tasks} tasks and ${migrated.habits} letter progress. Your points and streak have been preserved.`,
      };
    } catch (error) {
      throw new Error(`Migration failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
});

export const exportData = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) throw new Error("User not found");

    const habits = await ctx.db
      .query("habits")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const letterProgress = await ctx.db
      .query("letterProgress")
      .withIndex("by_user_lang", (q) =>
        q.eq("userId", user._id).eq("language", user.language)
      )
      .collect();

    return {
      user: {
        currentStreak: user.currentStreak,
        bestStreak: user.bestStreak,
        totalPoints: user.totalPoints,
        totalDays: user.totalDays,
        waterGoal: user.waterGoal,
        language: user.language,
      },
      habits: habits.filter((h) => !h.archived),
      tasks,
      letterProgress,
      exportedAt: Date.now(),
    };
  },
});
