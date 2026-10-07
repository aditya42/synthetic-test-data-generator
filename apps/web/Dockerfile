FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
RUN npm ci --no-audit --no-fund
COPY apps/web apps/web
EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "@stdg/web", "--", "--host", "0.0.0.0"]
