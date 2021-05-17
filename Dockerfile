FROM node:14

ARG USER_ID=1000
ARG GROUP_ID=1000

WORKDIR /app

RUN mkdir /ssh && chmod 777 /app /ssh
RUN groupadd --gid ${GROUP_ID} appuser; exit 0
RUN if [ "$UID" != "S{USER_ID}" ]; then echo ${USER_ID} > .uid; useradd -g ${GROUP_ID} --create-home --uid $(cat .uid) appuser; rm .uid; fi

COPY ./scripts/entry-point.sh /usr/local/bin/

USER ${USER_ID}:${GROUP_ID}

ENTRYPOINT [ "entry-point.sh" ]

CMD ["npm", "start"]
