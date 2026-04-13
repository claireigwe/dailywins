import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getUserIdFromToken } from "./auth";

const SRS_INTERVALS = [0, 1, 3, 7, 14, 30];

export const getLetterProgress = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    console.log("[getLetterProgress] Starting with token:", args.token?.substring(0, 10) + "...");
    const userId = await getUserIdFromToken(ctx, args.token);
    console.log("[getLetterProgress] userId:", userId);
    if (!userId) return [];

    const user = await ctx.db.get(userId);
    console.log("[getLetterProgress] user found:", !!user);
    if (!user) return [];
    
    // Ensure user has language field (backward compatibility)
    let language = user.language;
    if (!language) {
      language = "spanish";
      await ctx.db.patch(user._id, { language });
      console.log("[getLetterProgress] patched user language to spanish");
    }
    console.log("[getLetterProgress] language:", language);

    const progress = await ctx.db
      .query("letterProgress")
      .withIndex("by_user_lang", (q) =>
        q.eq("userId", user._id).eq("language", language)
      )
      .collect();
    
    console.log("[getLetterProgress] progress count:", progress.length);
    return progress;
  },
});

export const markLetterMastered = mutation({
  args: { token: v.string(), letter: v.string() },
  handler: async (ctx, args) => {
    try {
      console.log("[markLetterMastered] ENTER handler");
      console.log("[markLetterMastered] Starting with args:", args);
      const userId = await getUserIdFromToken(ctx, args.token);
      console.log("[markLetterMastered] userId:", userId);
      if (!userId) throw new Error("Invalid session");

      const user = await ctx.db.get(userId);
      console.log("[markLetterMastered] user:", user);
      if (!user) throw new Error("User not found");
      // Ensure totalPoints is a number
      if (typeof user.totalPoints !== 'number') {
        await ctx.db.patch(user._id, { totalPoints: 0 });
        user.totalPoints = 0;
        console.log("[markLetterMastered] fixed user.totalPoints to 0");
      }
      
      // Ensure user has language field (backward compatibility)
      let language = user.language;
      if (!language) {
        language = "spanish";
        await ctx.db.patch(user._id, { language });
        console.log("[markLetterMastered] patched user language to spanish");
      }
      console.log("[markLetterMastered] language:", language);
      const letter = args.letter.toUpperCase();
      console.log("[markLetterMastered] letter (original):", args.letter, "-> (uppercase):", letter);

        let existing;
        try {
          // Query all letter progress for this user+language, then filter by letter
          const results = await ctx.db
            .query("letterProgress")
            .withIndex("by_user_lang", (q) =>
              q.eq("userId", user._id)
                .eq("language", language)
            )
            .collect();
          console.log("[markLetterMastered] all letter progress count:", results.length);
          // Filter to matching letter
          const matching = results.filter(r => r.letter === letter);
          console.log("[markLetterMastered] matching letter count:", matching.length);
          if (matching.length > 1) {
            console.error("[markLetterMastered] DUPLICATE LETTER PROGRESS ENTRIES:", matching);
            // Take the first one
            existing = matching[0];
          } else if (matching.length === 1) {
            existing = matching[0];
          } else {
            existing = null;
          }
          console.log("[markLetterMastered] existing progress:", existing);
        } catch (queryError) {
          console.error("[markLetterMastered] Query failed:", queryError);
          throw queryError;
        }

      if (existing) {
        if (!existing.mastered) {
          try {
            await ctx.db.patch(existing._id, {
              mastered: true,
              masteredAt: Date.now(),
            });
            console.log("[markLetterMastered] Patched existing progress");
          } catch (patchError) {
            console.error("[markLetterMastered] Patch existing failed:", patchError);
            throw patchError;
          }
          const newTotalPoints = user.totalPoints + 10;
          try {
            await ctx.db.patch(user._id, {
              totalPoints: newTotalPoints,
            });
            console.log("[markLetterMastered] Updated user points from", user.totalPoints, "to", newTotalPoints);
          } catch (userPatchError) {
            console.error("[markLetterMastered] User patch failed:", userPatchError);
            throw userPatchError;
          }
        }
        return { alreadyMastered: true };
      }

      const insertDoc = {
        userId: user._id,
        language: language,
        letter: letter,
        mastered: true,
        masteredAt: Date.now(),
      };
      console.log("[markLetterMastered] Inserting letter progress:", insertDoc);
      try {
        await ctx.db.insert("letterProgress", insertDoc);
        console.log("[markLetterMastered] Insert succeeded");
      } catch (insertError) {
        console.error("[markLetterMastered] Insert failed:", insertError);
        throw insertError;
      }

      const newTotalPoints2 = user.totalPoints + 10;
      try {
        await ctx.db.patch(user._id, {
          totalPoints: newTotalPoints2,
        });
        console.log("[markLetterMastered] User points updated from", user.totalPoints, "to", newTotalPoints2);
      } catch (userPatchError) {
        console.error("[markLetterMastered] User points patch failed:", userPatchError);
        throw userPatchError;
      }

      console.log("[markLetterMastered] Letter marked mastered successfully");
      return { alreadyMastered: false };
    } catch (error) {
      console.error("[markLetterMastered] Error:", error);
      console.error("[markLetterMastered] Stack:", error.stack);
      throw error;
    }
  },
});

export const getVocabProgress = query({
  args: { token: v.string(), wordId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserIdFromToken(ctx, args.token);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
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
    token: v.string(),
    wordId: v.string(),
    rating: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getUserIdFromToken(ctx, args.token);
    if (!userId) throw new Error("Invalid session");

    const user = await ctx.db.get(userId);
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
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserIdFromToken(ctx, args.token);
    if (!userId) return [];

    const user = await ctx.db.get(userId);
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
  args: { token: v.string(), date: v.string(), correct: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await getUserIdFromToken(ctx, args.token);
    if (!userId) throw new Error("Invalid session");

    const user = await ctx.db.get(userId);
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
  args: { token: v.string(), date: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserIdFromToken(ctx, args.token);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
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

export const backfillUserLanguages = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserIdFromToken(ctx, args.token);
    if (!userId) throw new Error("Unauthenticated");

    // Get all users
    const users = await ctx.db.query("users").collect();
    let updated = 0;
    
    for (const user of users) {
      if (!user.language) {
        await ctx.db.patch(user._id, { language: "spanish" });
        updated++;
      }
    }
    
    return { updated, total: users.length };
  },
});
