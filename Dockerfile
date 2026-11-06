FROM node:22-alpine

# su-exec permite iniciar como root só para ajustar o volume e então
# executar o app com o usuário node.
RUN apk add --no-cache su-exec

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

COPY package.json ./
COPY servidor.js ./
COPY lib ./lib
COPY public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /data \
  && chown -R node:node /app /data

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/saude').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "servidor.js"]
