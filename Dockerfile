# ---------- Stage 1: build ----------
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies using the lockfile for reproducible builds
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy application source
COPY index.js ./
COPY public ./public

# ---------- Stage 2: runtime ----------
FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Create a dedicated non-root user/group to run the app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy only what's needed to run the app from the build stage
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/index.js ./index.js
COPY --from=build /app/public ./public

# Drop privileges
USER appuser

EXPOSE 3000

CMD ["node", "index.js"]
