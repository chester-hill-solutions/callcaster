FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm install && npm run build
ARG PORT=3000
EXPOSE $PORT
ENV PORT=$PORT
CMD npm start
