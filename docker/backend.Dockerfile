FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run prisma:generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 3001
CMD ["sh", "-c", "if [ \"$DATABASE_BOOTSTRAP\" = \"migrate\" ]; then npx prisma migrate deploy; elif [ \"$DATABASE_BOOTSTRAP\" != \"none\" ]; then npx prisma db push; fi && node dist/main.js"]
