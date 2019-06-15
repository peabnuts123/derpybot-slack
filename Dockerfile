FROM node:10-alpine

# Move all processing into `node` user home directory
WORKDIR /home/node/

# Copy JUST package.json and install so cache is only affected by package.json
COPY package*.json ./
RUN npm install

# Copy the rest of the project
COPY . .

# Set ownership of all files to 'node' and assume user
RUN chown -R node:node .
USER node

# (On run) run the server
CMD ["npm", "start"]
