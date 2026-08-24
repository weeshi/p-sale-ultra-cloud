# ====================== P-Sale Ultra Cloud — Client (PWA) ======================
# Build context: client/ — لا يعتمد على shared/

# ---- مرحلة البناء ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json tsconfig.node.json tailwind.config.js postcss.config.js ./
COPY public/ public/
COPY src/ src/

RUN npm run build

# ---- مرحلة التشغيل ----
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
