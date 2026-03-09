FROM python:3.12-slim

WORKDIR /app

# System dependencies for ML/CV libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libgomp1 libgl1 libglib2.0-0 curl && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Persistent storage dirs (used by both HF Spaces and Render)
RUN mkdir -p /data/uploads /data/db uploads

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 2
