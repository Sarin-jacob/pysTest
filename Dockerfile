ARG PYTHON_VERSION=3.11

# ==================================================================
# Stage 1: 'builder' - Install Python dependencies
# ==================================================================
FROM python:${PYTHON_VERSION}-slim AS builder

WORKDIR /app

RUN pip install --upgrade pip
COPY ./src/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ./src /app
RUN mkdir -p /app/uploads && chown -R 65532:65532 /app/uploads


# ==================================================================
# Stage 2: 'minifier' - Build and minify static assets
# ==================================================================
FROM node:20-slim AS minifier

WORKDIR /build

RUN npm init -y && \
    npm install terser html-minifier clean-css-cli

COPY --from=builder /app/public /build/public_src

RUN mkdir -p /build/public_dist
RUN mkdir -p /build/cache # To store the name cache

# --- JS MINIFICATION (with Reserved Names and Cache) ---

ARG NAME_CACHE=/build/cache/terser-names.json

ARG RESERVED_NAMES=['Chart','jspdf','jsPDF']

RUN npx terser public_src/util.js \
    -c \
    -m \
    reserved=${RESERVED_NAMES} \
    --toplevel \
    --name-cache ${NAME_CACHE} \
    -o public_dist/util.js

RUN for f in public_src/cptx.js public_src/cptax.js public_src/gng.js public_src/stroop.js; do \
      OUT_FILE="public_dist/$(basename "$f")"; \
      npx terser "$f" \
        -c \
        -m reserved=${RESERVED_NAMES} \
        --toplevel \
        --name-cache ${NAME_CACHE} \
        -o "$OUT_FILE"; \
    done

# --- END JS MINIFICATION ---


RUN for f in $(find public_src -name '*.css'); do \
      OUT_FILE="public_dist/$(basename "$f")"; \
      npx clean-css-cli "$f" -o "$OUT_FILE"; \
    done

RUN for f in $(find public_src -name '*.html'); do \
      OUT_FILE="public_dist/$(basename "$f")"; \
      npx html-minifier "$f" -o "$OUT_FILE" \
        --collapse-whitespace \
        --remove-comments \
        --minify-js true \
        --minify-css true; \
    done


# ==================================================================
# Stage 3: 'final' -  distroless image
# ==================================================================
FROM gcr.io/distroless/python3-debian12:nonroot
USER nonroot
ARG PYTHON_VERSION=3.11

WORKDIR /app

COPY --from=builder /usr/local/lib/python${PYTHON_VERSION}/site-packages /usr/local/lib/python${PYTHON_VERSION}/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY --from=builder --chown=65532:65532 /app/app.py /app/app.py
COPY --from=builder --chown=65532:65532 /app/uploads /app/uploads
COPY --from=minifier --chown=65532:65532 /build/public_dist /app/public

ENV PYTHONPATH=/usr/local/lib/python${PYTHON_VERSION}/site-packages

EXPOSE 8080

CMD ["/usr/local/bin/gunicorn", "-w", "4", "-b", "0.0.0.0:8080", "app:app"]