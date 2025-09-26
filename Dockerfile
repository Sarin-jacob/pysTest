FROM python:3.11-slim AS builder

WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

FROM gcr.io/distroless/python3-debian12:nonroot
WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /app /app
ENV PATH="/opt/venv/bin:$PATH"

EXPOSE 8080
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:8080", "app:app"]
