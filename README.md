# DILSE Super App Platform

A full-stack, multi-tenant web platform for development and social-sector users to launch and organize tools in one personalized dashboard.

## Stack
- Node.js + Express
- EJS server-rendered frontend
- SQLite database (`better-sqlite3`)
- Session auth (`express-session` + SQLite session store)

## Features
- Landing page with:
  - Email/password login
  - **Continue as Guest** mode
- Home dashboard with 5 fixed categories:
  1. Knowledge
  2. Learning Space
  3. My Work Space
  4. Community
  5. New Funds and Talents
- Per-category “+” add panel to select/deselect tools.
- Regular user selections persist in DB (`user_tool_selections`).
- Guest selections are session-only.
- Admin area (`/admin`) with tool CRUD:
  - Create tools
  - Edit tools
  - Activate/deactivate tools
  - Delete tools
  - Filter by category
- Admin route protection.

## Seeded accounts (no sign-up in v1)
After first run, these are available immediately:

- **Admin**
  - Email: `admin@example.com`
  - Password: `AdminPass123!`

- **Regular user**
  - Email: `user@example.com`
  - Password: `UserPass123!`

## Seeded tool catalog
The app seeds example tools for each of the 5 categories so you can test behavior immediately.

## Run locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start app:
   ```bash
   npm start
   ```
3. Open:
   ```
   http://localhost:3000
   ```

The SQLite DB is auto-created at `data/app.db` and sessions at `data/sessions.db`.

## Core flow testing guide

### 1) Login flow
- Visit `/`.
- Log in with `user@example.com / UserPass123!`.
- Confirm redirect to `/home`.

### 2) Guest flow
- From `/`, click **Continue as Guest**.
- Confirm guest banner is shown on `/home`.
- Add/remove tools with the `+` button and save.
- Confirm choices remain during current session, but are not persisted like a logged-in user.

### 3) Regular user personalization
- Log in as regular user.
- On `/home`, open a category panel with `+`.
- Select/deselect tools and save.
- Refresh page and confirm persisted selections.

### 4) Admin flow
- Log in with `admin@example.com / AdminPass123!`.
- Confirm redirect to `/admin`.
- Create a tool in any category.
- Edit it, toggle active state, and delete it.
- Confirm deactivated tools do not appear in the user “+” tool picker.

## Notes
- URLs open in a new browser tab from tool tiles.
- This v1 intentionally omits self-signup and advanced RBAC.
