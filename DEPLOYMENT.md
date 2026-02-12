# BTC Trade Tracker - Deployment Guide

## Quick Start Checklist

### Phase 1: Firebase Setup (5 minutes)

1. **Create Firebase Project**
   - Go to https://console.firebase.google.com/
   - Click "Add project"
   - Name it "btc-trade-tracker" (or your preference)
   - Disable Google Analytics (optional)
   - Click "Create project"

2. **Enable Firestore Database**
   - In Firebase Console, go to "Build" > "Firestore Database"
   - Click "Create database"
   - Start in "test mode" (we'll secure it later)
   - Choose your region (closest to you)
   - Click "Enable"

3. **Enable Storage**
   - Go to "Build" > "Storage"
   - Click "Get started"
   - Start in "test mode"
   - Click "Done"

4. **Get Firebase Config**
   - Go to Project Settings (gear icon)
   - Scroll to "Your apps" section
   - Click "</>" (Web app icon)
   - Register app with nickname "btc-tracker-web"
   - Copy the firebaseConfig object

5. **Update Your Code**
   - Open `src/config/firebase.js`
   - Replace the placeholder config with your actual config
   - Save the file

### Phase 2: Local Testing (2 minutes)

1. **Install Dependencies**
   ```bash
   cd btc-trade-tracker
   npm install
   ```

2. **Run Locally**
   ```bash
   npm run dev
   ```

3. **Test the App**
   - Visit http://localhost:3000
   - Click the + button to add a test trade
   - Verify it saves and displays correctly
   - Check that the equity curve updates

### Phase 3: GitHub Setup (3 minutes)

1. **Create GitHub Repository**
   - Go to https://github.com/new
   - Name: "btc-trade-tracker"
   - Make it Private (recommended)
   - Don't initialize with README (we already have one)
   - Click "Create repository"

2. **Push Your Code**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: BTC Trade Tracker"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/btc-trade-tracker.git
   git push -u origin main
   ```

### Phase 4: Vercel Deployment (3 minutes)

1. **Sign Up/Login to Vercel**
   - Go to https://vercel.com
   - Sign up with GitHub (easiest)

2. **Import Project**
   - Click "Add New" > "Project"
   - Import your GitHub repository
   - Vercel will auto-detect it's a Vite project

3. **Configure Build Settings**
   - Framework Preset: Vite (should be auto-detected)
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

4. **Deploy**
   - Click "Deploy"
   - Wait 1-2 minutes
   - Your app is live! 🎉

5. **Get Your URL**
   - Vercel will give you a URL like: `btc-trade-tracker.vercel.app`
   - You can customize this in Project Settings

### Phase 5: Secure Your Firebase (Important!)

Once you've tested everything works, secure your Firebase:

1. **Firestore Rules** (Build > Firestore Database > Rules)
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // Allow all reads and writes for now
       // TODO: Add authentication and user-specific rules
       match /{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```

2. **Storage Rules** (Build > Storage > Rules)
   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /{allPaths=**} {
         allow read, write: if true;
       }
     }
   }
   ```

   Note: These rules allow public access. For production, you'll want to add authentication.

## Troubleshooting

### Build Fails on Vercel
- Check that firebase.js has valid config
- Verify package.json has all dependencies
- Check Vercel build logs for specific errors

### Charts Not Showing
- Check that you've uploaded at least 2-3 trades
- Verify trade dates are valid
- Check browser console for errors

### Images Not Uploading
- Verify Firebase Storage is enabled
- Check Storage rules allow writes
- Ensure image file size is reasonable (<5MB)

### Can't See Trades
- Check Firebase Console > Firestore Database
- Verify trades are being saved
- Check browser console for Firebase errors

## Next Steps

1. **Add More Trades** - The more data, the better your analytics
2. **Customize** - Update colors, metrics, or add new features
3. **Backup** - Export your trades periodically
4. **Security** - Add Firebase Authentication for multi-device access

## Custom Domain (Optional)

To use your own domain:

1. Buy a domain (Namecheap, Google Domains, etc.)
2. In Vercel Project Settings > Domains
3. Add your domain
4. Update your domain's DNS settings as instructed
5. Wait for SSL certificate (automatic)

## Support

If you run into issues:
1. Check the browser console for errors
2. Check Firebase Console for configuration
3. Review Vercel deployment logs
4. Verify all dependencies are installed

---

**Estimated Total Setup Time: 15-20 minutes**

Good luck with your trading! 📈
