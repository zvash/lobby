FROM mhart/alpine-node

RUN apk add build-base
RUN apk add python2

WORKDIR /app

#COPY package*.json ./

COPY . .

#RUN npm config set user 0
#RUN npm config set unsafe-perm true

RUN npm install forever -g
RUN npm install

#RUN npm run

#EXPOSE 3000

#CMD ["npm", "run", "start"]

CMD ["forever", "-w", "./index.js"]
#CMD ["node", "./index.js"]
#ENTRYPOINT ["tail"]
#CMD ["-f","/dev/null"]