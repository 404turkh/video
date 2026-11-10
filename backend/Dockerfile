FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY transcription_server.py ./
ENV PORT=8000 WHISPER_MODEL=base WHISPER_DEVICE=cpu WHISPER_COMPUTE=int8
CMD ["sh","-c","exec uvicorn transcription_server:app --host 0.0.0.0 --port \${PORT:-8000} --workers 1"]
