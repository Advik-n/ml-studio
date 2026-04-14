# ML Studio 🧪

A full-stack AI/ML web platform for exploratory data analysis, ML pipeline building, and model deployment.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Advik-n/ml-studio)

## ✨ Features

### 🔐 User Authentication
- Secure registration with email verification (6-digit OTP)
- CAPTCHA challenge on registration
- JWT-based session management
- Support for up to 10,000 users

### 📊 EDA (Exploratory Data Analysis)
- Upload pandas-compatible files: `.csv`, `.tsv`, `.xls`, `.xlsx`, `.json`, `.parquet`
- Auto-generates a **senior-engineer quality** Jupyter notebook with:
  - Basic statistics, data quality assessment
  - Univariate & bivariate analysis (histograms, correlation heatmaps, box plots)
  - Multivariate analysis (pair plots, PCA)
  - Time series detection
  - Automated findings & key insights
  - Data cleaning (deduplication, imputation, outlier removal)
- Generates a **Word document** report with findings and recommendations
- Outputs: original data, cleaned dataset, `.ipynb`, `.docx` — all in a project folder
- Auto-zips if output is large

### 🤖 ML Pipeline Builder
- Visual, step-by-step pipeline builder with **color-coded steps**
- Supports:
  - **Classification**: Logistic Regression, Random Forest, Gradient Boosting, SVM, KNN, Decision Tree
  - **Regression**: Linear Regression, Ridge, Lasso, Random Forest, Gradient Boosting, SVR
  - **Clustering**: K-Means, DBSCAN, Agglomerative Clustering
  - **NLP**: TF-IDF + classifiers
- Configurable: transformers, train/test split, hyperparameters, feature/target selection
- Generates executable `.ipynb` notebook
- **Interactive prediction GUI**: input features → get predictions with confidence scores

### ⚙️ Settings & Themes
- Profile management (username, email, password change)
- Three beautiful themes:
  - 🌙 **Dark** — sleek dark UI
  - ☀️ **Light** — clean professional white
  - 🟣 **Purple (Dracula)** — VS Code Dracula-inspired

## 🏗️ Architecture

```
ml-studio/
├── frontend/          # Next.js 14 (App Router) + TypeScript + TailwindCSS
├── backend/           # FastAPI (Python) + SQLAlchemy + SQLite
├── .copilot/agents/   # 5 specialized Copilot agents
└── vercel.json        # Vercel deployment config
```

### Copilot Agents
| Agent | Responsibility |
|-------|---------------|
| `system-design` | Architecture, API design, scalability |
| `frontend` | Next.js components, themes, animations |
| `backend` | FastAPI routes, ML processing, file generation |
| `database` | SQLAlchemy models, migrations, optimization |
| `security` | JWT auth, CAPTCHA, input validation |

## 🚀 Quick Start

### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
API docs at: http://localhost:8000/docs

### Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```
App at: ml-studio-zeta.vercel.app

## 🌐 Deployment (100% Free)

### Step 1: Deploy Backend → Render (Free)
1. Go to [render.com](https://render.com) → **New → Web Service**
2. Connect GitHub → select `ml-studio` repo → root directory: `backend/`
3. Render auto-reads `render.yaml` — just click **Create Web Service** (free plan)
4. Add env vars from `backend/.env.example` in Render dashboard
5. Copy your Render URL: `https://ml-studio-api.onrender.com`

> **Note:** Render free tier spins down after 15 min idle (cold start ~30s). Still free!

### Step 2: Deploy Frontend → Vercel (Free)
1. Go to [vercel.com/new](https://vercel.com/new) → Import `ml-studio` repo
2. Set **Root Directory** to `frontend/`
3. Add environment variable: `NEXT_PUBLIC_API_URL` = your Render URL
4. Click **Deploy** → get your `https://ml-studio-xxx.vercel.app` URL

### Step 3: Auto-Deploy via GitHub Actions (Optional)
For automatic deployments on every `git push`, add these **GitHub Secrets** in  
[github.com/Advik-n/ml-studio/settings/secrets/actions](https://github.com/Advik-n/ml-studio/settings/secrets/actions):

| Secret | Where to get it |
|--------|----------------|
| `VERCEL_TOKEN` | vercel.com → Settings → Tokens |
| `VERCEL_ORG_ID` | vercel.com → Settings → General → Team ID |
| `VERCEL_PROJECT_ID` | Vercel project → Settings → General |
| `NEXT_PUBLIC_API_URL` | Your Render backend URL |
| `RENDER_DEPLOY_HOOK` | Render dashboard → project → Settings → Deploy Hook |

### Alternative Backend: Hugging Face Spaces (Always Free, No Spin-Down)
1. [huggingface.co/new-space](https://huggingface.co/new-space) → SDK: **Docker**
2. Upload `backend/` files — uses port `7860` (configured in `Dockerfile`)

## 📁 Environment Variables

### Backend (`backend/.env`)
```
SECRET_KEY=your-secret-key
DATABASE_URL=sqlite:///./ml_studio.db
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
BASE_URL=https://your-app.onrender.com
FRONTEND_URL=https://your-app.vercel.app
```

### Frontend (`frontend/.env.local`)
```
NEXT_PUBLIC_API_URL=https://your-app.onrender.com
```

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, TailwindCSS, Framer Motion |
| Backend | FastAPI, Python 3.12, SQLAlchemy, Pydantic |
| Database | SQLite (dev) / PostgreSQL (prod) |
| Auth | JWT (python-jose), bcrypt |
| ML | scikit-learn, pandas, numpy, matplotlib, seaborn |
| Notebooks | nbformat, jupyter |
| Reports | python-docx |
| Email | SMTP / smtplib |

## 📄 License
MIT
