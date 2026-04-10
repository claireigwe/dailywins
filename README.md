# Daily Wins 🏆

Your personal habit tracker with streaks, points, and daily wins. Now with full-stack features including user authentication and real-time sync across devices.

## Features

- **Customizable Habits**: Create and manage your own daily habits
- **Streak Tracking**: Build momentum with daily streak tracking
- **Gamification**: Earn points, level up, and unlock badges
- **Language Learning**: Built-in vocabulary and alphabet practice (Spanish, French, German, Japanese, Yoruba)
- **Water Tracking**: Stay hydrated with customizable daily goals
- **Tasks**: Add and manage daily tasks
- **Daily Reflections**: End-of-day journaling prompts
- **Statistics**: Track your progress over time with detailed stats

## Tech Stack

- **Frontend**: Vanilla JavaScript (PWA-ready)
- **Backend**: Convex (TypeScript, real-time database)
- **Auth**: Convex Auth (Google, Apple, Magic Links)
- **Hosting**: Convex Cloud (or self-hosted)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- A Convex account (free tier available at [convex.dev](https://convex.dev))

### 1. Set Up Convex Project

```bash
# Install Convex CLI globally
npm install -g convex

# Initialize Convex in your project
npx convex init
```

### 2. Configure Authentication

1. Go to [Convex Dashboard](https://dashboard.convex.dev)
2. Navigate to Authentication
3. Enable Google OAuth:
   - Create OAuth credentials at [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - Add authorized redirect URI from Convex dashboard
4. Enable Apple Sign-In:
   - Create App ID with Sign-In capability at [Apple Developer](https://developer.apple.com)
   - Configure in Convex dashboard

### 3. Set Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:

```env
VITE_CONVEX_URL=https://your-project.convex.cloud
GOOGLE_CLIENT_ID=your-client-id
APPLE_CLIENT_ID=com.yourapp.dailywins
```

### 4. Run Development Server

```bash
npm install
npm run dev
```

This starts both:
- Convex backend (at `localhost:61888`)
- Frontend dev server (at `localhost:5173` or similar)

### 5. Deploy

```bash
npx convex deploy
```

## Project Structure

```
dailywins/
├── convex/
│   ├── schema.ts          # Database schema
│   ├── auth.ts           # Auth configuration
│   ├── users.ts          # User queries/mutations
│   ├── habits.ts         # Habit management
│   ├── tasks.ts          # Task management
│   ├── water.ts          # Water tracking
│   ├── language.ts        # Language learning
│   ├── reflections.ts     # Daily reflections
│   ├── stats.ts           # Statistics & badges
│   ├── intentions.ts      # Daily intentions
│   └── migration.ts       # localStorage migration
├── index.html            # Main app
├── auth.js              # Auth utilities
├── store.js            # State management
├── onboarding.js       # Onboarding wizard
├── convex-client.js    # Convex client setup
├── sw.js               # Service worker
├── manifest.json       # PWA manifest
└── package.json        # Dependencies
```

## Database Schema

### Users Table
- `email`: User's email address
- `name`: Display name
- `onboardingComplete`: Boolean
- `waterGoal`: Daily water goal (default: 8)
- `language`: Learning language (default: spanish)
- `currentStreak`: Current habit streak
- `bestStreak`: Best streak achieved
- `totalPoints`: Gamification points

### Habits Table
- `userId`: Reference to user
- `name`: Habit name
- `icon`: Emoji icon
- `description`: Habit description
- `points`: Points awarded
- `order`: Display order
- `archived`: Soft delete flag

### Additional Tables
- `habitLogs`: Daily habit completions
- `tasks`: User tasks
- `waterLogs`: Daily water intake
- `reflections`: Daily reflections
- `intentions`: Daily intentions
- `letterProgress`: Language letter mastery
- `vocabProgress`: Vocabulary SRS data
- `badges`: Unlocked achievements

## Migrating from Local Storage

If you have data in the original localStorage-based version:

1. Sign up/login with the same email
2. You'll be prompted to import your existing data
3. Your habits, tasks, streaks, and progress will be imported

## Customization

### Adding New Language Templates

Edit `convex/language.ts` and add new language data following the existing structure.

### Adding New Habit Templates

Edit `onboarding.js` and add new templates to the `TEMPLATES` object.

### Customizing Reflection Options

Users can customize reflection options in Settings, or you can modify the defaults in `convex/users.ts`.

## PWA Setup

The app is PWA-ready with:
- Service worker for offline support
- Web app manifest for installability
- Mobile-optimized UI

To update icons, replace files in the `icons/` directory.

## License

MIT

## Contributing

Contributions welcome! Please read the code style and submit PRs.

---

Built with ❤️ using [Convex](https://convex.dev)
