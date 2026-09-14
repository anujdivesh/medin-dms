# Multi-stage build for React frontend
FROM node:18-alpine AS builder

WORKDIR /app

ARG VITE_BASE_PATH="/"
ARG VITE_API_BASE_URL=""
ARG VITE_ES_BASE=""
ARG VITE_ES_USERNAME=""
ARG VITE_ES_PASSWORD=""

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy source code
COPY . .

# Debug: Show what build args we received
RUN echo "Build args received:" && \
    echo "VITE_BASE_PATH: ${VITE_BASE_PATH}" && \
    echo "VITE_API_BASE_URL: ${VITE_API_BASE_URL}" && \
    echo "VITE_ES_BASE: ${VITE_ES_BASE}" && \
    echo "VITE_ES_USERNAME: ${VITE_ES_USERNAME}" && \
    echo "VITE_ES_PASSWORD: ${VITE_ES_PASSWORD}"

# Build the application with env variables
ENV VITE_BASE_PATH=${VITE_BASE_PATH}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_ES_BASE=${VITE_ES_BASE}
ENV VITE_ES_USERNAME=${VITE_ES_USERNAME}
ENV VITE_ES_PASSWORD=${VITE_ES_PASSWORD}

# Create .env file for build
RUN echo "VITE_BASE_PATH=${VITE_BASE_PATH}" > .env && \
    echo "VITE_API_BASE_URL=${VITE_API_BASE_URL}" >> .env && \
    echo "VITE_ES_BASE=${VITE_ES_BASE}" >> .env && \
    echo "VITE_ES_USERNAME=${VITE_ES_USERNAME}" >> .env && \
    echo "VITE_ES_PASSWORD=${VITE_ES_PASSWORD}" >> .env

# Debug: Show the .env file contents
RUN echo "Contents of .env file:" && cat .env

# Build with verbose output
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config if needed
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
