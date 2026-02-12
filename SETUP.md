# Complete Setup Guide - BTC Trade Tracker

## What You've Got

Your BTC Trade Tracker is now a **fully functional web app** with:

✅ Dashboard with real-time metrics  
✅ Interactive equity curve  
✅ Trade entry with chart uploads  
✅ Weekly performance tracker  
✅ Monthly tracker with grades (A-F)  
✅ Chart patterns library  
✅ **Import button** to auto-populate your Feb 8-14 trades  
✅ Mobile responsive design  

## Phase 1: Firebase Setup (5 minutes)

### Step 1: Create Firebase Project

1. Go to **https://console.firebase.google.com/**
2. Click **"Add project"** or **"Create a project"**
3. Enter project name: `btc-trade-tracker`
4. Click **Continue**
5. **Disable** Google Analytics (you don't need it)
6. Click **Create project**
7. Wait 30 seconds for it to finish
8. Click **Continue**

### Step 2: Enable Firestore Database

1. In the left sidebar, click **"Build"** → **"Firestore Database"**
2. Click **"Create database"**
3. Select **"Start in test mode"** (we'll secure it later)
4. Choose location: **us-central** (or closest to you)
5. Click **Enable**
6. Wait 20 seconds for it to initialize

### Step 3: Enable Storage

1. In the left sidebar, click **"Build"** → **"Storage"**
2. Click **"Get started"**
3. Click **"Next"** (keep test mode rules)
4. Choose same location as Firestore
5. Click **Done**

### Step 4: Get Your Firebase Config

1. Click the **⚙️ gear icon** (Project Settings) in the left sidebar
2. Scroll down to **"Your apps"** section
3. Click the **</>** button (Web icon)
4. Register app nickname: `btc-tracker-web`
5. Click **"Register app"**
6. You'll see a `firebaseConfig` object - **COPY THIS**

It looks like this:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "btc-trade-tracker.firebaseapp.com",
  projectId: "btc-trade-tracker",
  storageBucket: "btc-trade-tracker.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456"
};
```

### Step 5: Update Your Code

1. Open the `btc-trade-tracker` folder you downloaded
2. Navigate to `src/config/firebase.js`
3. Replace the placeholder config with YOUR config
4. Save the file

**Before:**
```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  // ...
};
```

**After:**
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "btc-trade-tracker.firebaseapp.com",
  // ... (your actual values)
};
```

## Phase 2: Local Testing (3 minutes)

### Step 1: Open Terminal

**Mac:**
- Press `Cmd + Space`
- Type "Terminal"
- Press Enter

**Windows:**
- Press `Windows + R`
- Type "cmd"
- Press Enter

### Step 2: Navigate to Project

```bash
cd path/to/btc-trade-tracker
```

**Tip:** You can drag the folder into Terminal to get the path automatically!

### Step 3: Install Dependencies

```bash
npm install
```

This will take 1-2 minutes. You'll see a progress bar.

### Step 4: Start Development Server

```bash
npm run dev
```

You'll see:
```
VITE v5.0.8  ready in 234 ms

➜  Local:   http://localhost:3000/
➜  Network: use --host to expose
```

### Step 5: Test the App

1. Open your browser
2. Go to **http://localhost:3000**
3. You should see your BTC Trade Tracker!

### Step 6: Import Sample Trades

1. Click the **"Import Sample Trades"** button (purple button at top)
2. Confirm the import
3. Wait 5-10 seconds
4. You'll see 15 trades populate!
5. The equity curve will update
6. Metrics will calculate

**Try it out:**
- Click the **+** button to add a new trade
- Upload a chart image
- View the Weekly tab
- Check the Monthly tab with grades

## Phase 3: Deploy to Vercel (5 minutes)

### Step 1: Push to GitHub

First, initialize git and push your code:

```bash
# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: BTC Trade Tracker"

# Create main branch
git branch -M main
```

### Step 2: Create GitHub Repository

1. Go to **https://github.com/new**
2. Repository name: `btc-trade-tracker`
3. Make it **Private** (recommended)
4. **Don't** initialize with README (you already have one)
5. Click **"Create repository"**

### Step 3: Push Your Code

Copy the commands GitHub shows you, or use these (replace YOUR_USERNAME):

```bash
git remote add origin https://github.com/YOUR_USERNAME/btc-trade-tracker.git
git push -u origin main
```

### Step 4: Deploy on Vercel

1. Go to **https://vercel.com**
2. Click **"Sign Up"** (use GitHub - it's easiest)
3. Authorize Vercel to access GitHub
4. Click **"Add New"** → **"Project"**
5. Find your `btc-trade-tracker` repository
6. Click **"Import"**

Vercel will auto-detect settings:
- Framework Preset: **Vite** ✓
- Build Command: `npm run build` ✓
- Output Directory: `dist` ✓

7. Click **"Deploy"**
8. Wait 1-2 minutes
9. **Done!** 🎉

### Step 5: Get Your Live URL

Vercel will give you a URL like:
```
https://btc-trade-tracker.vercel.app
```

You can:
- Share this URL
- Add it to your phone home screen
- Customize it in Project Settings

## Using Your App

### Adding a Trade

1. Click the **+ button** (bottom right)
2. Fill in:
   - Ticker (defaults to last ticker used)
   - Direction (Long/Short)
   - Entry Price
   - Exit Price
   - Leverage (defaults to 25x)
   - Gain/Loss in USD
   - Fee
   - Upload chart image (optional)
   - Add comment (optional)
3. Click **Save Trade**

**The app auto-calculates P&L%!**

### Viewing Trades

- **Dashboard**: See recent trades and equity curve
- **Weekly**: View weekly performance with expandable trade lists
- **Monthly**: See monthly grades (A-F) based on performance
- **Chart Patterns**: Save reference patterns with descriptions

### Understanding Grades (Monthly)

**A Grade:** Excellent (300%+ monthly P&L, 3+ profit factor, 15%+ expectancy)  
**B Grade:** Good (200%+ monthly P&L, 2+ profit factor, 10%+ expectancy)  
**C Grade:** Average (100%+ monthly P&L, 1.5+ profit factor, 5%+ expectancy)  
**D Grade:** Below Average (50%+ monthly P&L, 1+ profit factor)  
**F Grade:** Poor (negative or minimal gains)

## Troubleshooting

### "Firebase is not defined"
- Check that you updated `src/config/firebase.js` with your actual config
- Make sure you copied the ENTIRE config object
- Restart the dev server (`npm run dev`)

### No trades showing after import
- Check Firebase Console → Firestore Database
- Make sure you have collections called "trades"
- Check browser console for errors (F12)

### Charts not uploading
- Verify Storage is enabled in Firebase Console
- Check Storage rules are in test mode
- Try a smaller image (<2MB)

### Build fails on Vercel
- Check that `firebase.js` has valid config (no "YOUR_API_KEY")
- Verify all dependencies are in package.json
- Check Vercel build logs for specific error

### Can't access on mobile
- Make sure you're using the Vercel URL (not localhost)
- Try clearing browser cache
- Check that Firebase rules allow public access

## Next Steps

1. **Start Trading!** - Add your real trades as you make them
2. **Upload Charts** - Document your setups
3. **Review Weekly** - Analyze your patterns every Sunday
4. **Track Monthly** - Aim for better grades each month
5. **Add Patterns** - Build your pattern library

## Advanced: Custom Domain (Optional)

To use your own domain (e.g., `trades.yourdomain.com`):

1. Buy a domain (Namecheap, Google Domains, etc.)
2. In Vercel: **Project Settings** → **Domains**
3. Add your domain
4. Update DNS settings as instructed
5. Wait 5-10 minutes for SSL certificate

## Security Note

Your current setup is in **test mode**, which means:
- ✅ You can read/write data
- ⚠️ Anyone with the URL can also read/write

For production, you'll want to add Firebase Authentication. For now, just don't share your URL publicly if you want to keep data private.

## Support

Having issues? Check:
1. Browser console (F12) for errors
2. Firebase Console for data
3. Vercel deployment logs
4. Network tab to see failed requests

---

**Total Setup Time: 15-20 minutes**

You're ready to track your trading performance like a pro! 📈🚀
