# PROTOTYPE, throwaway
FROM python:3.13-slim-trixie
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
ENV UV_PROJECT_ENVIRONMENT=/venv UV_LINK_MODE=copy UV_NO_CACHE=1 HF_HOME=/work/.cache/hf
WORKDIR /app
COPY pyproject.toml ./
RUN uv lock && uv sync --locked --no-install-project
WORKDIR /work/py
