FROM node:22-alpine
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY package.json ./
COPY src ./src
USER node
EXPOSE 4000
CMD ["npm", "start"]
