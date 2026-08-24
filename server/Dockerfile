# ====================== P-Sale Ultra Cloud — Server ======================
# Build context: جذر المشروع (repo root) — يحتاج server/ + shared/ معاً

# ---- مرحلة البناء ----
FROM node:20-alpine AS builder
WORKDIR /app

# نسخ ملفات الحزم أولاً لتفعيل كاش الطبقات
COPY server/package.json server/package-lock.json ./server/
COPY shared/ ./shared/

# نسخ الكود المصدري
COPY server/ ./server/

WORKDIR /app/server
RUN npm ci
RUN npx prisma generate
RUN npm run build

# ---- مرحلة التشغيل ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# node_modules كاملة (تشمل prisma CLI لتنفيذ migrations في مرحلة منفصلة)
COPY --from=builder /app/server/package.json ./server/package.json
COPY --from=builder /app/server/package-lock.json ./server/package-lock.json
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prisma ./server/prisma

WORKDIR /app/server
EXPOSE 3005
CMD ["node", "dist/server/src/app.js"]
