FROM node:20-trixie-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /app/data

ENV PORT=3002
EXPOSE 3002

CMD ["npm", "start"]
