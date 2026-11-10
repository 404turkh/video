"""SubStudio self-hosted transcription server.
No OpenAI API needed. Compute and hosting resources ARE required.
Set STUDIO_ACCESS_KEY and ALLOWED_ORIGINS before exposing publicly.
"""
from __future__ import annotations

import asyncio
import hmac
import logging
import os
import secrets
import subprocess
import tempfile
import time
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

LOG = logging.getLogger("substudio")
MODEL_SIZE = os.getenv("WHISPER_MODEL", "base").strip()
MODEL_DEVICE = os.getenv("WHISPER_DEVICE", "cpu").strip()
MODEL_COMPUTE = os.getenv("WHISPER_COMPUTE", "int8").strip()
MAX_BYTES = int(os.getenv("MAX_UPLOAD_MB", "120")) * 1024 * 1024
MAX_SECONDS = int(os.getenv("MAX_VIDEO_SECONDS", "600"))
ACCESS_KEY = os.getenv("STUDIO_ACCESS_KEY", "")
ORIGINS = [x.strip().rstrip("/") for x in os.getenv(
    "ALLOWED_ORIGINS", "https://404turkh.github.io"
).split(",") if x.strip()]
EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm", ".mp3", ".m4a", ".wav", ".ogg", ".flac"}
GATE = asyncio.Semaphore(1)
JOBS: dict[str, dict] = {}
JOB_TTL_SECONDS = 7200
MAX_PENDING_JOBS = 3

app = FastAPI(title="SubStudio transcription", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Studio-Key"],
    max_age=600,
)


@lru_cache(maxsize=1)
def whisper() -> WhisperModel:
    LOG.info("Loading local model: %s, device=%s", MODEL_SIZE, MODEL_DEVICE)
    return WhisperModel(
        MODEL_SIZE, device=MODEL_DEVICE, compute_type=MODEL_COMPUTE, num_workers=1
    )


def video_duration(path: str) -> float:
    process = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True, timeout=20, check=False,
    )
    if process.returncode != 0:
        raise ValueError("Video veya ses dosyası açılamadı (ffprobe).")
    try:
        seconds = float(process.stdout.strip())
    except ValueError as exc:
        raise ValueError("Dosya süresi okunamadı.") from exc
    if not (0 < seconds <= MAX_SECONDS):
        raise ValueError(f"Video süresi en fazla {MAX_SECONDS // 60} dakika olabilir.")
    return seconds


def run_transcription(path: str, language: str) -> dict:
    duration = video_duration(path)
    segments, info = whisper().transcribe(
        path,
        language=language or None,
        task="transcribe",  # Never translate Turkish speech to English
        beam_size=4,
        condition_on_previous_text=False,
        word_timestamps=True,
        vad_filter=False,
    )
    words = []
    fallback_count = 0
    for segment in segments:
        if segment.words:
            for w in segment.words:
                if not w.word or w.start is None or w.end is None:
                    continue
                if w.end <= w.start:
                    continue
                words.append({
                    "word": str(w.word).strip(),
                    "start": round(float(w.start), 3),
                    "end": round(float(w.end), 3),
                    "estimated": False,
                })
        elif segment.text:
            # The frontend will label the estimated timing if individual word
            # timestamps are unavailable. These are NOT precise word times.
            fallback_count += 1
            words.append({
                "word": segment.text.strip(),
                "start": round(float(segment.start), 3),
                "end": round(float(segment.end), 3),
                "estimated": True,
            })
    if not words:
        raise ValueError("Konuşma bulunamadı. Video sesini kontrol edin.")
    return {
        "words": words, "language": info.language,
        "duration": duration, "approximate_segments": fallback_count
    }


@app.get("/health")
def health() -> dict:
    # Never return the access key.
    return {"ok": True, "service": "substudio-transcription", "max_seconds": MAX_SECONDS}


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form("turkish"),
    x_studio_key: str | None = Header(default=None),
):
    if len(ACCESS_KEY) < 16:
        raise HTTPException(status_code=503, detail="Sunucu erişim kodu henüz ayarlanmamış.")
    if not hmac.compare_digest(x_studio_key or "", ACCESS_KEY):
        raise HTTPException(status_code=401, detail="Sunucu erişim kodu yanlış.")
    lang = {
        "turkish": "tr", "arabic": "ar", "english": "en", "auto": "",
        "tr": "tr", "ar": "ar", "en": "en",
    }.get(language)
    if lang is None:
        raise HTTPException(status_code=400, detail="Desteklenmeyen konuşma dili.")
    suffix = Path(file.filename or "clip.mp4").suffix.lower()
    if suffix not in EXTENSIONS:
        raise HTTPException(status_code=415, detail="MP4, MOV, WebM veya desteklenen ses dosyasını yükle.")

    saved_path = None
    count = 0
    try:
        with tempfile.NamedTemporaryFile(prefix="substudio_", suffix=suffix, delete=False) as handle:
            saved_path = handle.name
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                count += len(chunk)
                if count > MAX_BYTES:
                    raise HTTPException(status_code=413, detail=f"Dosya en fazla {MAX_BYTES // 1048576} MB olabilir.")
                handle.write(chunk)
        if count < 1000:
            raise HTTPException(status_code=400, detail="Video dosyası boş veya geçersiz.")
        # Only one model inference at a time; prevents parallel OOM on modest hosts.
        async with GATE:
            try:
                return await asyncio.to_thread(run_transcription, saved_path, lang)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception:
        LOG.exception("Transcription failed")
        raise HTTPException(status_code=500, detail="Sunucu işlemi başarısız oldu. Sunucu loglarını kontrol et.")
    finally:
        await file.close()
        if saved_path:
            try:
                os.unlink(saved_path)
            except FileNotFoundError:
                pass


def authenticated(access: str | None) -> None:
    if len(ACCESS_KEY) < 16:
        raise HTTPException(status_code=503, detail="Sunucuda erişim kodu ayarlanmamış.")
    if not hmac.compare_digest(access or "", ACCESS_KEY):
        raise HTTPException(status_code=401, detail="Erişim kodu yanlış.")


def language_code(value: str) -> str:
    choices = {"turkish": "tr", "arabic": "ar", "english": "en", "auto": "",
               "tr": "tr", "ar": "ar", "en": "en"}
    lang = choices.get(value)
    if lang is None:
        raise HTTPException(status_code=400, detail="Bilinmeyen konuşma dili.")
    return lang


def prune_jobs() -> None:
    now = time.time()
    for key, job in list(JOBS.items()):
        if job.get("updated", 0) + JOB_TTL_SECONDS < now and job["status"] in ("done", "error"):
            JOBS.pop(key, None)


async def upload_to_temp(file: UploadFile) -> str:
    suffix = Path(file.filename or "clip.mp4").suffix.lower()
    if suffix not in EXTENSIONS:
        raise HTTPException(status_code=415, detail="Desteklenmeyen video/ses uzantısı.")
    filename = None
    length = 0
    try:
        with tempfile.NamedTemporaryFile(prefix="substudio_", suffix=suffix, delete=False) as dest:
            filename = dest.name
            while True:
                buffer = await file.read(1024 * 1024)
                if not buffer:
                    break
                length += len(buffer)
                if length > MAX_BYTES:
                    raise HTTPException(status_code=413, detail=f"En fazla {MAX_BYTES//1048576} MB dosya yüklenebilir.")
                dest.write(buffer)
        if length < 1000:
            raise HTTPException(status_code=400, detail="Dosyada yeterli ses/video verisi bulunamadı.")
        return filename
    except BaseException:
        if filename:
            try:
                os.unlink(filename)
            except FileNotFoundError:
                pass
        raise
    finally:
        await file.close()


async def process_job(job_id: str, filename: str, language: str) -> None:
    job = JOBS[job_id]
    try:
        async with GATE:
            job.update(status="processing", updated=time.time())
            result = await asyncio.to_thread(run_transcription, filename, language)
            job.update(status="done", result=result, updated=time.time())
    except ValueError as exc:
        job.update(status="error", error=str(exc), updated=time.time())
    except Exception:
        LOG.exception("Async transcription job failed: %s", job_id)
        job.update(status="error", error="Sunucu AI işlemi başarısız. Sunucu loglarını kontrol et.", updated=time.time())
    finally:
        try:
            os.unlink(filename)
        except FileNotFoundError:
            pass


@app.post("/jobs", status_code=202)
async def start_job(
    file: UploadFile = File(...),
    language: str = Form("turkish"),
    x_studio_key: str | None = Header(default=None),
):
    authenticated(x_studio_key)
    lang = language_code(language)
    prune_jobs()
    pending = sum(1 for job in JOBS.values() if job["status"] in ("queued", "processing"))
    if pending >= MAX_PENDING_JOBS:
        raise HTTPException(status_code=429, detail="Sunucu meşgul. Biraz sonra tekrar dene.")
    filename = await upload_to_temp(file)
    job_id = secrets.token_urlsafe(20)
    JOBS[job_id] = {"status": "queued", "updated": time.time()}
    asyncio.create_task(process_job(job_id, filename, lang))
    return {"job_id": job_id, "status": "queued"}


@app.get("/jobs/{job_id}")
async def job_status(job_id: str, x_studio_key: str | None = Header(default=None)):
    authenticated(x_studio_key)
    prune_jobs()
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Görev bulunamadı. Sunucu yeniden başlamış olabilir.")
    result = {"status": job["status"]}
    if job["status"] == "done":
        result["result"] = job["result"]
    elif job["status"] == "error":
        result["error"] = job["error"]
    return result
