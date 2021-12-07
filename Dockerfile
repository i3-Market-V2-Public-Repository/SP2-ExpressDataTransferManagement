FROM node:14-slim

COPY ./scripts/dependencies.sh ./dependencies.sh

ADD ./app /app

ENV PUBLIC_URI=http://localhost:3000
ENV PORT=3000
ENV BLOCK_SIZE=128

WORKDIR /app

RUN chmod +x /dependencies.sh && bash /dependencies.sh

CMD ["npm", "start"]
