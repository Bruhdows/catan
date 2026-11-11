FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install --no-package-lock --no-audit --no-fund && npm run build
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 SERVE_WEB=true WEB_DIST_DIR=../web/dist DATA_DIR=data
WORKDIR /app/apps/server
EXPOSE 3000
CMD ["npm","run","start"]
