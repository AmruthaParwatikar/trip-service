FROM node:20-trixie-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /app/data /app/runtime

ENV DB_PATH=/app/runtime/trip-service.db

ENV PORT=3002
VOLUME ["/app/runtime"]
EXPOSE 3002

CMD ["npm", "start"]
