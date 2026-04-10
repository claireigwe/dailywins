import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const SRS_INTERVALS = [0, 1, 3, 7, 14, 30];

export const getLetterProgress = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) return [];

    const progress = await ctx.db
      .query("letterProgress")
      .withIndex("by_user_lang", (q) =>
        q.eq("userId", user._id).eq("language", user.language)
      )
      .collect();

    return progress;
  },
});

export const markLetterMastered = mutation({
  args: { letter: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) throw new Error("User not found");

    const existing = await ctx.db
      .query("letterProgress")
      .withIndex("by_user_lang", (q) =>
        q.eq("userId", user._id)
          .eq("language", user.language)
          .eq("letter", args.letter)
      )
      .unique();

    if (existing) {
      if (!existing.mastered) {
        await ctx.db.patch(existing._id, {
          mastered: true,
          masteredAt: Date.now(),
        });
        await ctx.db.patch(user._id, {
          totalPoints: user.totalPoints + 10,
        });
      }
      return { alreadyMastered: true };
    }

    await ctx.db.insert("letterProgress", {
      userId: user._id,
      language: user.language,
      letter: args.letter,
      mastered: true,
      masteredAt: Date.now(),
    });

    await ctx.db.patch(user._id, {
      totalPoints: user.totalPoints + 10,
    });

    return { alreadyMastered: false };
  },
});

export const getVocabProgress = query({
  args: { wordId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) return null;

    const progress = await ctx.db
      .query("vocabProgress")
      .withIndex("by_user_word", (q) =>
        q.eq("userId", user._id).eq("wordId", args.wordId)
      )
      .unique();

    return progress;
  },
});

export const rateVocabWord = mutation({
  args: {
    wordId: v.string(),
    rating: v.number(),
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
      .query("vocabProgress")
      .withIndex("by_user_word", (q) =>
        q.eq("userId", user._id).eq("wordId", args.wordId)
      )
      .unique();

    let newLevel: number;
    let correct: number;
    let wrong: number;

    if (existing) {
      correct = existing.correct;
      wrong = existing.wrong;

      if (args.rating === 0) {
        newLevel = Math.max(0, existing.level - 1);
        wrong++;
      } else if (args.rating === 1) {
        newLevel = existing.level;
        wrong++;
      } else {
        newLevel = Math.min(5, existing.level + 1);
        correct++;
      }

      const days = SRS_INTERVALS[newLevel];
      const nextReview = Date.now() + days * 86400000;

      await ctx.db.patch(existing._id, {
        level: newLevel,
        nextReview,
        correct,
        wrong,
        lastReviewed: Date.now(),
      });
    } else {
      correct = args.rating === 2 ? 1 : 0;
      wrong = args.rating === 2 ? 0 : 1;
      newLevel = args.rating === 2 ? 1 : 0;
      const days = SRS_INTERVALS[newLevel];
      const nextReview = Date.now() + days * 86400000;

      await ctx.db.insert("vocabProgress", {
        userId: user._id,
        wordId: args.wordId,
        level: newLevel,
        nextReview,
        correct,
        wrong,
        lastReviewed: Date.now(),
      });
    }

    const daysUntilNextReview = SRS_INTERVALS[newLevel];

    return {
      level: newLevel,
      daysUntilNextReview,
      correct,
      wrong,
    };
  },
});

export const getDueWords = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) return [];

    const now = Date.now();
    const progress = await ctx.db
      .query("vocabProgress")
      .withIndex("by_user_nextReview", (q) => q.eq("userId", user._id))
      .collect();

    return progress.filter((p) => p.nextReview <= now);
  },
});

export const logLangChallenge = mutation({
  args: { date: v.string(), correct: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) throw new Error("User not found");

    await ctx.db.insert("langChallengeLogs", {
      userId: user._id,
      date: args.date,
      correct: args.correct,
      answeredAt: Date.now(),
    });

    if (args.correct) {
      await ctx.db.patch(user._id, {
        totalPoints: user.totalPoints + 15,
      });
    }

    return { success: true };
  },
});

export const getLangChallengeForDate = query({
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
      .query("langChallengeLogs")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", user._id).eq("date", args.date)
      )
      .unique();

    return log;
  },
});
