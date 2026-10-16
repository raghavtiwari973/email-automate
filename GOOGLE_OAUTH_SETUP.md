# Google OAuth Setup Guide
## Sapcon AI Mail System — Gmail API Authentication

### Step 1: Create a Google Cloud Project

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Click **"New Project"** → name it `Sapcon AI` → Create

---

### Step 2: Enable Gmail API

1. In your project, go to **APIs & Services → Library**
2. Search for **"Gmail API"** → Click Enable

---

### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. Select **External** → Create
3. Fill in:
   - App name: `Sapcon AI Mail`
   - User support email: your Gmail
   - Developer contact: your Gmail
4. Click Save & Continue (skip Scopes for now)
5. Under **Test users**, add your Gmail address → Save

---

### Step 4: Create OAuth 2.0 Credentials

1. Go to **APIs & Services → Credentials**
2. Click **"+ Create Credentials"** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `Sapcon AI`
5. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:8000/auth/callback
   ```
6. Click **Create**

---

### Step 5: Download & Place Credentials File

1. After creating, click **"Download JSON"**
2. Rename the downloaded file to exactly:
   ```
   google_credentials.json
   ```
3. Place it in the project root folder:
   ```
   c:\Users\rt191\Music\ollama-work-flow\google_credentials.json
   ```

---

### Step 6: Use the App

1. Start the server: `python -m uvicorn server:app --host 0.0.0.0 --port 8000`
2. Open: [http://localhost:8000](http://localhost:8000)
3. Click **"Sign in with Google"** in the top bar
4. Authorize the app with your Google account
5. You're connected — now upload leads and send emails!

---

> **Note**: After the first sign-in, your token is saved locally in `google_token.json`.
> You won't need to sign in again unless you log out or the token expires.
