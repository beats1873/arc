FROM node:20-alpine

# Install fonts required by @napi-rs/canvas for text rendering
RUN apk add --no-cache fontconfig ttf-dejavu && fc-cache -f

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

CMD ["node", "index.js"]
