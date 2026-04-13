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

export async function getUserIdFromToken(ctx: any, token: string): Promise<string | null> {
  // First check sessions table
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  
  if (session && session.expiry > Date.now()) {
    return session.userId;
  }
  
  // Fallback to credentials for backward compatibility
  const credentials = await ctx.db.query("credentials").collect();
  const credential = credentials.find(c => c.sessionToken === token);
  if (credential && credential.sessionExpiry > Date.now()) {
    return credential.userId;
  }
  
  return null;
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
    const token = generateToken();
    const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
    
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
      sessionToken: token,
      sessionExpiry: expiry,
    });

    // Create session for multi-device support
    await ctx.db.insert("sessions", {
      userId,
      token,
      expiry,
      createdAt: Date.now(),
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
    const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
    
    await ctx.db.patch(credential._id, {
      sessionToken: token,
      sessionExpiry: expiry,
    });

    // Create session for multi-device support
    await ctx.db.insert("sessions", {
      userId: credential.userId,
      token,
      expiry,
      createdAt: Date.now(),
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
    // Delete session for this token
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (session) {
      await ctx.db.delete(session._id);
    }
    
    // Also clear credential token if it matches (for backward compatibility)
    const credentials = await ctx.db.query("credentials").collect();
    const credential = credentials.find(c => c.sessionToken === args.token);
    if (credential) {
      await ctx.db.patch(credential._id, {
        sessionToken: "",
        sessionExpiry: 0,
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
    
    const userId = await getUserIdFromToken(ctx, args.token);
    if (!userId) {
      return null;
    }
    
    const user = await ctx.db.get(userId);
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

export const migrateSessions = mutation({
  args: {},
  handler: async (ctx) => {
    const credentials = await ctx.db.query("credentials").collect();
    let migrated = 0;
    for (const cred of credentials) {
      if (cred.sessionToken && cred.sessionExpiry > Date.now()) {
        const existing = await ctx.db
          .query("sessions")
          .withIndex("by_token", (q) => q.eq("token", cred.sessionToken))
          .unique();
        if (!existing) {
          await ctx.db.insert("sessions", {
            userId: cred.userId,
            token: cred.sessionToken,
            expiry: cred.sessionExpiry,
            createdAt: Date.now(),
          });
          migrated++;
        }
      }
    }
    return { migrated };
  },
});
