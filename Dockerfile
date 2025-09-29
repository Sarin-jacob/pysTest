ARG PYTHON_VERSION=3.11
FROM python:${PYTHON_VERSION}-slim AS builder

WORKDIR /app

RUN pip install --upgrade pip
COPY ./src/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ./src /app
RUN mkdir -p /app/uploads && chown -R 65532:65532 /app/uploads

FROM gcr.io/distroless/python3-debian12:nonroot
USER nonroot
ARG PYTHON_VERSION=3.11

WORKDIR /app

COPY --from=builder /usr/local/lib/python${PYTHON_VERSION}/site-packages /usr/local/lib/python${PYTHON_VERSION}/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY --from=builder --chown=65532:65532 /app /app

ENV PYTHONPATH=/usr/local/lib/python${PYTHON_VERSION}/site-packages

EXPOSE 8080

CMD ["/usr/local/bin/gunicorn", "-w", "4", "-b", "0.0.0.0:8080", "app:app"]
