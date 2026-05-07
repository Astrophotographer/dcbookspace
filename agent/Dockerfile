# DCbookspace 인쇄 에이전트
# Synology Container Manager (DSM 7.x) 또는 일반 Docker 호환.
#
# Puppeteer 공식 이미지를 베이스로 — Chromium·필요 폰트 모두 사전 설치돼 있어
# Synology 에서 별도 설정 없이 바로 동작.

FROM ghcr.io/puppeteer/puppeteer:23.5.0 AS build

USER root
WORKDIR /app

# 의존성 먼저 (캐시 활용)
COPY package.json tsconfig.json ./
RUN npm install --no-audit --no-fund

# 소스
COPY src ./src
RUN npm run build

# === runtime stage ===
FROM ghcr.io/puppeteer/puppeteer:23.5.0
USER root
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Puppeteer 가 다운받은 Chromium 캐시는 베이스 이미지에 이미 있음.
# PUPPETEER_SKIP_DOWNLOAD=true 로 npm install 시 재다운 막을 수도 있지만,
# 단순함 위해 그대로 둠.

ENV NODE_ENV=production
USER pptruser

CMD ["node", "dist/index.js"]
