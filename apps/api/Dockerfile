FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
RUN npm ci --no-audit --no-fund
COPY packages/core packages/core
COPY apps/api apps/api
RUN npm run build -w @stdg/core && npm run build -w @stdg/api
EXPOSE 8081
CMD ["npm", "run", "start", "-w", "@stdg/api"]
