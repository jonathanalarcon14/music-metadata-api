# ---- Build ----
FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
# The husky "prepare" script has no place inside the image (no .git, no hooks)
RUN npm pkg delete scripts.prepare && npm ci
COPY . .
RUN npm run build

# ---- Production dependencies ----
FROM node:24-slim AS deps
WORKDIR /app
COPY package*.json ./
# Same: "prepare" would run husky, which isn't installed with --omit=dev
RUN npm pkg delete scripts.prepare && npm ci --omit=dev

# ---- Runtime ----
FROM node:24-slim
ENV NODE_ENV=production

# ffmpeg: audio trimming | libchromaprint-tools: fpcalc (fingerprinting)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg libchromaprint-tools \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main"]
