FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# install all deps (needed for build)
RUN npm install

COPY . .

# build project
RUN npm run build

# remove dev dependencies
RUN npm prune --omit=dev

EXPOSE 3000

CMD ["node", "dist/main.js"]