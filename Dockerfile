# ==================================================================
# Stage 1: 'builder' - Install deps, Build and Minify
# ==================================================================
FROM node:20-slim AS builder

WORKDIR /app

# 1. Install App Dependencies
COPY src/package.json .
RUN npm install

# 2. Copy Source Code
COPY . .

# 3. Prepare Uploads Directory (Permissions for nonroot)
RUN mkdir -p /app/uploads

# 4. Prepare Output Directory for Public Assets
# We assume source assets are in ./src/public (based on your original Dockerfile structure)
# But standard Node apps usually have them in ./public. 
# Adjusting to match your original input: ./src/public -> ./public_dist
RUN mkdir -p /app/public_dist
RUN mkdir -p /app/cache

# --- ASSET MINIFICATION (Replicating Logic) ---
# We use npx to run the devDependencies installed in package.json

ARG NAME_CACHE=/app/cache/terser-names.json
ARG RESERVED_NAMES='Chart,jspdf,jsPDF'

# Minify util.js
RUN npx terser src/public/util.js \
    -c \
    -m reserved=[${RESERVED_NAMES}] \
    --toplevel \
    --name-cache ${NAME_CACHE} \
    -o public_dist/util.js

# Minify specific JS files
RUN for f in src/public/cptx.js src/public/cptax.js src/public/gng.js src/public/stroop.js; do \
      if [ -f "$f" ]; then \
        OUT_FILE="public_dist/$(basename "$f")"; \
        npx terser "$f" \
          -c \
          -m reserved=[${RESERVED_NAMES}] \
          --toplevel \
          --name-cache ${NAME_CACHE} \
          -o "$OUT_FILE"; \
      fi \
    done

# Minify CSS
RUN for f in $(find src/public -name '*.css'); do \
      OUT_FILE="public_dist/$(basename "$f")"; \
      npx clean-css-cli "$f" -o "$OUT_FILE"; \
    done

# Minify HTML
RUN for f in $(find src/public -name '*.html'); do \
      OUT_FILE="public_dist/$(basename "$f")"; \
      npx html-minifier-terser "$f" -o "$OUT_FILE" \
        --collapse-whitespace \
        --remove-comments \
        --minify-js true \
        --minify-css true; \
    done

# Prune dev dependencies for production image size
RUN npm prune --production

# ==================================================================
# Stage 2: 'final' - Distroless Node Image
# ==================================================================
FROM gcr.io/distroless/nodejs20-debian12:nonroot
USER nonroot

WORKDIR /app

# Copy node_modules (production only)
COPY --from=builder /app/node_modules /app/node_modules

# Copy Server Code
COPY --from=builder /app/server.js /app/server.js
COPY --from=builder /app/package.json /app/package.json

# Copy Uploads folder (with correct ownership from builder)
COPY --from=builder --chown=65532:65532 /app/uploads /app/uploads

# Copy Minified Public Assets
# We rename public_dist to public so server.js finds them easily
COPY --from=builder --chown=65532:65532 /app/public_dist /app/public

# Set Environment
ENV NODE_ENV=production

EXPOSE 8080

# Distroless nodejs entrypoint is implicit "node", so we just pass the file
CMD ["server.js"]