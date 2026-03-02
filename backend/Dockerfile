FROM python:3.12-slim

WORKDIR /app

# Install system deps for opencv, matplotlib, scipy
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libgomp1 libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create local fallback dirs (persistent storage is at /data on HF Spaces)
RUN mkdir -p uploads /data/db /data/uploads

EXPOSE 7860

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
