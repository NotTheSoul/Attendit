# Attendit — production image (adapter-node output).
# Belmo/nixpacks pins Node 22.11, but our deps need ^22.12 — so we ship our
# own Dockerfile and skip nixpacks version roulette entirely.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "build"]
