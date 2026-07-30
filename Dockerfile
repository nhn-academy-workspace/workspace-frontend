# 빌드 컨텍스트: frontend/ (docker-compose.yml에서 build.context: ./frontend)

# ---- 빌드 스테이지 ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- 실행 스테이지: nginx가 정적 파일 서빙 + /api 프록시 ----
FROM nginx:stable
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
