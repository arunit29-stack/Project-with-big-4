# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app

FROM base AS builder
RUN apt-get update && apt-get install -y --no-install-recommends build-essential gcc && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml poetry.lock* requirements.txt* ./
RUN python -m pip install --upgrade pip && \
    if [ -f requirements.txt ]; then pip wheel --wheel-dir /wheels -r requirements.txt; fi
COPY . .

FROM base AS runner
RUN useradd --create-home --shell /usr/sbin/nologin ai
WORKDIR /app
COPY --from=builder /wheels /wheels
RUN if [ -d /wheels ]; then pip install /wheels/*; fi
COPY --from=builder /app /app
USER ai
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
