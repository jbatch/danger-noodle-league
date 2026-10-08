FROM node:24-alpine AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder

ARG NEXT_PUBLIC_SITE_URL=""
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}

COPY . .
RUN npm run build

FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV FRONTEND_PORT=3001
ENV GAME_HOST=0.0.0.0

COPY package.json ./
COPY --from=builder /app/dist/standalone ./dist/standalone
COPY --from=builder /app/node_modules/react ./node_modules/react
COPY --from=builder /app/node_modules/react-dom ./node_modules/react-dom
COPY --from=builder /app/node_modules/scheduler ./node_modules/scheduler
COPY --from=builder /app/node_modules/ws ./node_modules/ws
COPY server ./server
COPY shared ./shared
COPY scripts/start.mjs ./scripts/start.mjs

RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null || exit 1

CMD ["node", "scripts/start.mjs"]
