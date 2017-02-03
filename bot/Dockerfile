# latest official node image
FROM node:latest

RUN npm install -g nodemon

# use cached layer for node modules
#ADD package.json /tmp/package.json
#RUN cd /tmp && npm install
#RUN mkdir -p /usr/src/bot && cp -a /tmp/node_modules /usr/src/bot/

# add project files
ADD . /usr/src/bot
WORKDIR /usr/src/bot

CMD npm install && nodemon -L src/bot.js config.yml