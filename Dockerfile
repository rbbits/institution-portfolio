FROM node:20-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
# We will use ts-node for the assessment to skip the build step and save time
CMD ["npx", "ts-node", "src/index.ts"]
EXPOSE 8080
