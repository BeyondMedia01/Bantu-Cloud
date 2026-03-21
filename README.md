# Bantu Payroll & HR Platform v2.0

Bantu is a full-stack payroll and HR management system specifically designed for the Zimbabwean market, featuring multi-currency support (USD/ZiG), statutory compliance (ZIMRA, NSSA, NEC), and AI-driven intelligence.

## Architecture

- **/frontend**: React + Vite + TailwindCSS.
- **/backend**: Node.js + Express + Prisma + PostgreSQL (Neon).

## Deployment (Vercel)

This project is pre-configured for **Vercel Monorepo Deployment**.

### 1. Connect to GitHub
To push this project to your own GitHub repository:
1. Create a **new empty repository** on GitHub.
2. Run the following commands in this directory:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```

### 2. Deploy to Vercel
1. Go to the [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **"Add New"** -> **"Project"**.
3. Import your new GitHub repository.
4. Leave the **"Root Directory"** as the base folder (the folder containing this README).
5. Add the following **Environment Variables** in the Vercel settings:
   - `DATABASE_URL`: Your PostgreSQL connection string (e.g., from Neon).
   - `JWT_SECRET`: A secure random string for signing tokens.
   - `NODE_ENV`: `production`
6. Click **"Deploy"**.

## Local Development

### Backend
1. `cd backend`
2. `npm install`
3. `npx prisma generate`
4. `npm run dev` (Runs on port 5005)

### Frontend
1. `cd frontend`
2. `npm install`
3. `npm run dev` (Runs on port 5173)

---
*Built with Bantu Audit Compliance Guard.*
