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

### Backend → Railway
1. Push repo to GitHub ✅
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select `ml-studio` repo → set root to `backend/`
4. Add environment variables from `backend/.env.example`
5. Copy Railway URL → set `NEXT_PUBLIC_API_URL` in Vercel

## 📁 Environment Variables

### Backend (`backend/.env`)
```
SECRET_KEY=your-secret-key
DATABASE_URL=sqlite:///./ml_studio.db
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
BASE_URL=https://your-railway-url.up.railway.app
FRONTEND_URL=https://your-app.vercel.app
```

### Frontend (`frontend/.env.local`)
```
NEXT_PUBLIC_API_URL=https://your-railway-url.up.railway.app
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
