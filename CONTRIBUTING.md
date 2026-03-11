# Contributing to OpenHive

First off, thank you for considering contributing to OpenHive! Every contribution helps make this project better for everyone.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Project Architecture](#project-architecture)

## Code of Conduct

By participating in this project, you agree to be respectful and constructive. We want OpenHive to be a welcoming community for everyone.

- Be kind and courteous
- Respect differing viewpoints
- Accept constructive criticism
- Focus on what is best for the community

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/openhive.git
   cd openhive
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Set up Supabase** — Follow the [setup instructions](README.md#getting-started) to connect your own Supabase project
5. **Start the dev server**:
   ```bash
   npm run dev
   ```

## Development Setup

### Prerequisites

- Node.js 18+
- npm
- A Supabase account (free tier is fine)
- Optionally: a LiveKit account for video call development

### Environment Variables

Copy `.env.example` to `.env.local` and fill in your Supabase credentials, or use the setup wizard at `http://localhost:3000/setup`.

### Key Technologies

- **Next.js 16** (App Router) — React framework
- **TypeScript** — Type safety
- **Tailwind CSS** — Utility-first CSS
- **shadcn/ui** — UI component library
- **Zustand** — State management
- **Supabase** — Backend (PostgreSQL, Auth, Realtime, Storage)
- **TipTap** — Rich text editor
- **LiveKit** — Video/audio calls

## Making Changes

### Branch Naming

Use descriptive branch names:
- `feature/add-dark-mode`
- `fix/message-scroll-bug`
- `docs/update-readme`
- `refactor/simplify-auth-flow`

### Commit Messages

Write clear, concise commit messages:
- `Add dark mode toggle to settings`
- `Fix message not scrolling to bottom on send`
- `Update README with LiveKit setup instructions`

### What to Work On

- Check [open issues](https://github.com/arseneHuot/openhive/issues) for bugs and feature requests
- Look for issues labeled `good first issue` for beginner-friendly tasks
- Look for issues labeled `help wanted` for tasks where we need assistance
- Have an idea? Open an issue first to discuss it

## Pull Request Process

1. **Create a feature branch** from `main`
2. **Make your changes** with clear, focused commits
3. **Test locally** — make sure the app builds and works:
   ```bash
   npm run build
   ```
4. **Push** your branch to your fork
5. **Open a Pull Request** against the `main` branch
6. **Describe your changes** — what does this PR do and why?
7. **Wait for review** — maintainers will review and provide feedback

### PR Checklist

- [ ] My code builds without errors (`npm run build`)
- [ ] I've tested my changes locally
- [ ] My changes don't break existing functionality
- [ ] I've added comments where the code isn't self-explanatory
- [ ] My PR has a clear title and description

## Code Style

### TypeScript

- Use TypeScript for all new files
- Define types in `src/types/database.ts` for database models
- Use proper type annotations (avoid `any` where possible)

### Components

- Use functional components with hooks
- Place components in the appropriate directory under `src/components/`
- Use shadcn/ui components where available
- Follow the existing naming conventions (PascalCase for components, kebab-case for files)

### Styling

- Use Tailwind CSS utility classes
- Follow the existing color palette:
  - Primary: `#7C5CFC` (lavender/purple)
  - Sidebar: `#F0EBFF`
  - Text dark: `#2D2B3D`
  - Text muted: `#8E8EA0`
  - Borders: `#E5E1EE` / `#DDD6F3`
- Use inline `style={{}}` for non-Tailwind colors (to keep the theme consistent)

### State Management

- Global state lives in `src/lib/store/app-store.ts` (Zustand)
- Keep component-local state in `useState` when it doesn't need to be shared
- Use Supabase Realtime subscriptions for live data

## Project Architecture

```
src/
├── app/              # Pages and API routes (Next.js App Router)
├── components/       # React components organized by feature
├── hooks/            # Custom React hooks
├── lib/              # Utilities, Supabase client, state store
└── types/            # TypeScript type definitions
```

### Key Files

| File | Description |
|------|-------------|
| `lib/store/app-store.ts` | Global Zustand store |
| `lib/supabase/client.ts` | Supabase browser client |
| `lib/supabase/migrations.ts` | All 23 SQL table definitions |
| `types/database.ts` | TypeScript types for all tables |
| `components/chat/channel-view.tsx` | Main chat view |
| `components/sidebar/sidebar.tsx` | Sidebar with channels & DMs |
| `components/calls/call-panel.tsx` | Video call overlay |

---

Thank you for contributing to OpenHive!
