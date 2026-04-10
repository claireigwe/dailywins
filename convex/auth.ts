import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "dailywins_salt_2024");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");
}

export const signUp = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    
    if (!email.includes("@") || email.length < 5) {
      throw new Error("Please enter a valid email address");
    }
    
    if (args.password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }
    
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    
    if (existing) {
      throw new Error("An account with this email already exists");
    }
    
    const passwordHash = await hashPassword(args.password);
    
    const userId = await ctx.db.insert("users", {
      email,
      name: args.name || null,
      onboardingComplete: false,
      waterGoal: 8,
      language: "spanish",
      currentStreak: 0,
      bestStreak: 0,
      totalPoints: 0,
      totalDays: 0,
      createdAt: Date.now(),
    });
    
    await ctx.db.insert("credentials", {
      userId,
      email,
      passwordHash,
      token: null,
      tokenExpiry: null,
    });
    
    await ctx.db.insert("userSettings", {
      userId,
      reflectionOptions: [
        "💪 Worked out",
        "🌅 Woke up early",
        "🥗 Ate well",
        "💧 Stayed hydrated",
        "📚 Studied",
        "✅ Cleared my tasks",
        "😴 Slept well",
        "🧘 Stayed calm",
      ],
      notificationEnabled: false,
      soundEnabled: true,
    });
    
    const token = generateToken();
    await ctx.db.patch(userId, {});
    
    const credentialDoc = await ctx.db
      .query("credentials")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    
    if (credentialDoc) {
      await ctx.db.patch(credentialDoc._id, {
        token,
        tokenExpiry: Date.now() + 30 * 24 * 60 * 60 * 1000,
      });
    }
    
    return {
      success: true,
      token,
      userId,
    };
  },
});

export const logIn = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    
    const credential = await ctx.db
      .query("credentials")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    
    if (!credential) {
      throw new Error("No account found with this email");
    }
    
    const passwordHash = await hashPassword(args.password);
    
    if (credential.passwordHash !== passwordHash) {
      throw new Error("Incorrect password");
    }
    
    const token = generateToken();
    await ctx.db.patch(credential._id, {
      token,
      tokenExpiry: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
    
    return {
      success: true,
      token,
      userId: credential.userId,
    };
  },
});

export const logOut = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const credential = await ctx.db
      .query("credentials")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    
    if (credential) {
      await ctx.db.patch(credential._id, {
        token: null,
        tokenExpiry: null,
      });
    }
    
    return { success: true };
  },
});

export const verifyToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!args.token) {
      return null;
    }
    
    const credential = await ctx.db
      .query("credentials")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    
    if (!credential) {
      return null;
    }
    
    if (credential.tokenExpiry && credential.tokenExpiry < Date.now()) {
      await ctx.db.patch(credential._id, {
        token: null,
        tokenExpiry: null,
      });
      return null;
    }
    
    const user = await ctx.db.get(credential.userId);
    
    return user;
  },
});

export const checkEmailExists = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    
    return !!existing;
  },
});
