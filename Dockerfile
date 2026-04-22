# Use official Node image
FROM node:18


WORKDIR /app


COPY package*.json ./


RUN npm install


COPY . .


EXPOSE 3002

# Start the app
CMD ["npm", "start"]
