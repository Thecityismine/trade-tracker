# BTC Trade Tracker

A comprehensive Bitcoin trading journal and performance tracker built with React, Firebase, and Tailwind CSS.

## Features

- 📊 **Dashboard** - Real-time metrics, equity curve, and recent trades
- 📈 **Analytics** - Detailed performance statistics (coming soon)
- 📅 **Weekly/Monthly Trackers** - Performance over time (coming soon)
- 📐 **Chart Patterns** - Save and reference trading patterns
- 💭 **Trading Mindset** - Journal your thoughts and reflections
- 📱 **Mobile Optimized** - Full responsive design
- 🔄 **Real-time Sync** - Firebase Firestore integration
- 📸 **Chart Screenshots** - Upload and view trade charts

## Tech Stack

- **Frontend**: React 18, Tailwind CSS, Vite
- **Backend**: Firebase (Firestore + Storage)
- **Charts**: Recharts
- **Icons**: Lucide React
- **Deployment**: Vercel

## Setup Instructions

### 1. Clone and Install

```bash
cd btc-trade-tracker
npm install
```

### 2. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable Firestore Database
4. Enable Storage
5. Get your Firebase config from Project Settings

### 3. Configure Firebase

Edit `src/config/firebase.js` and replace with your Firebase credentials:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 4. Firestore Rules

Set up your Firestore security rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true; // For testing - update for production
    }
  }
}
```

### 5. Storage Rules

Set up your Storage security rules:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true; // For testing - update for production
    }
  }
}
```

### 6. Run Locally

```bash
npm run dev
```

Visit `http://localhost:3000`

## Deployment to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

### 2. Deploy on Vercel

1. Go to [Vercel](https://vercel.com)
2. Import your GitHub repository
3. Configure project:
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Deploy!

### 3. Environment Variables (Optional)

If you want to use environment variables for Firebase config:

1. In Vercel, go to Project Settings > Environment Variables
2. Add your Firebase config values
3. Update `firebase.js` to use `import.meta.env.VITE_*` variables

## Usage

### Adding a Trade

1. Click the **+** button (bottom right)
2. Fill in trade details:
   - Ticker symbol
   - Direction (Long/Short)
   - Entry/Exit prices
   - Leverage
   - Gain/Loss amount
   - Fee
   - Upload chart image (optional)
   - Add comments
3. Click **Save Trade**

### Viewing Trade Details

- Click any trade in the Recent Trades table
- View full details including chart image

### Adding Chart Patterns

1. Go to **Chart Patterns** tab
2. Click **Add Pattern**
3. Upload chart image
4. Add pattern name and description
5. Add tags for easy filtering

## Database Schema

### trades Collection

```javascript
{
  ticker: "BTC",
  direction: "long" | "short",
  entryPrice: 65514,
  exitPrice: 65391,
  leverage: 25,
  gainLoss: -6.62,
  fee: 1.85,
  pnlPercent: -4.69,
  result: "win" | "loss" | "open",
  comment: "...",
  chartImageUrl: "https://...",
  tradeDate: Timestamp,
  createdAt: Timestamp
}
```

### chartPatterns Collection

```javascript
{
  name: "Bull Flag",
  description: "...",
  imageUrl: "https://...",
  tags: ["bullish", "continuation"],
  dateAdded: Timestamp
}
```

## Roadmap

- [ ] Complete Analytics page with charts
- [ ] Weekly tracker with performance metrics
- [ ] Monthly tracker with grades
- [ ] Export trades to CSV
- [ ] Dark/Light theme toggle
- [ ] Multi-user authentication
- [ ] Trade alerts and notifications
- [ ] Advanced filtering and search
- [ ] Trade tags and categories

## Support

For issues or questions, create an issue in the GitHub repository.

## License

MIT
