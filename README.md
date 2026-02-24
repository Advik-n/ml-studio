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
App at: http://localhost:3000

## 🌐 Deployment

### Frontend → Vercel
```bash
npm i -g vercel
vercel --prod
```

### Backend → Render (Free)
1. Go to [render.com](https://render.com) → New → Web Service
2. Connect your GitHub → select `ml-studio` repo → root directory: `backend/`
3. Render auto-detects `render.yaml` and fills in all settings
4. Click **Create Web Service** (free plan)
5. Copy the Render URL (e.g. `https://ml-studio-api.onrender.com`)
6. Set `NEXT_PUBLIC_API_URL` to that URL in Vercel

> **Note:** Render free tier spins down after 15 min of inactivity (cold start ~30s). Upgrade to $7/mo to keep it always-on.

### Alternative: Hugging Face Spaces (Always Free)
1. Go to [huggingface.co/new-space](https://huggingface.co/new-space)
2. SDK: **Docker**, set visibility: Public
3. Link your GitHub repo or upload `backend/` contents
4. Uses port `7860` (already configured in `Dockerfile`)

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
