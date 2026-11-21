# ---- 1. Build the React SPA ----
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- 2. Runtime: Express API that also serves the built SPA ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client /app/client/dist /app/client/dist
RUN mkdir -p uploads/avatars uploads/equipment uploads/attachments && chown -R node:node /app
USER node
EXPOSE 4000
CMD ["node", "src/index.js"]
