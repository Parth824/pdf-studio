FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV STANDALONE=1
RUN npm run build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv libreoffice-writer libreoffice-calc libreoffice-impress ghostscript tesseract-ocr-eng fonts-dejavu-core fonts-noto-core ffmpeg calibre && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY engine/requirements.txt ./engine/requirements.txt
RUN python3 -m venv .venv && .venv/bin/pip install --no-cache-dir -r engine/requirements.txt
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY engine ./engine
COPY lib/conversion-formats.json ./lib/conversion-formats.json
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node","server.js"]
