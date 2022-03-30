ARG BUILD_PATH=/build
ARG RUN_PATH=/app

##########################################################################################################################################
# Stage: Base
# - Creates necessary paths

FROM node:lts-alpine AS base

      # Import into Stage
      ARG BUILD_PATH
      ARG RUN_PATH

      USER root

      # Make necessary Directories
      RUN mkdir -p $BUILD_PATH $RUN_PATH

##########################################################################################################################################
# Stage: Base Build OS
# - Includes all base packages from OS needed to build

FROM base AS build-base

      ENV PYTHON=/usr/bin/python2

      # Node Compilation stuff
      RUN apk add --no-cache \
            g++ \
            gcc \
            git \
            libgcc \
            libstdc++ \
            linux-headers \
            make \
            python2 \
            sqlite

##########################################################################################################################################
# Stage: Development Environment
# - Installs npm dependencies in development mode

FROM build-base AS development

      # Import into Stage
      ARG BUILD_PATH

      ENV NODE_ENV=development

      WORKDIR ${BUILD_PATH}

      # Fixes issue with image running as root, but npm script running as `node`
      # See: comment block at bottom of this Stage
      RUN npm config set home /home/node/
      RUN npm config set cache /home/node/.npm

      COPY ./package*.json ./

      # legacy-peer-deps required because libs are dumb, not updating peers
      RUN npm i --legacy-peer-deps

      # Copy the source to allow development
      COPY . ./

      # At this point, source is built and owned by root inside the image,
      # but mostly as a transition to the `production-build` Stage.
      #
      # It's important to point out the assumption that while developing,
      # the volume mounted at /build will be owned by your host UID 1000,
      # which causes npm to run as the user `node` inside the
      # image (also UID 1000).
      # See: https://docs.npmjs.com/cli/v8/using-npm/scripts#user
      #
      # Additionally, files must be owned by root for Bitbucket file transfers
      # between docker build Stages, due to the way they manage userns
      # See: https://github.com/moby/moby/issues/34645

      CMD ["npm", "run", "docker-compose"]

##########################################################################################################################################
# Stage: Production Build
# - Rebuilds the project in Production Mode

FROM development AS production-build

      # Import into Stage
      ARG BUILD_PATH

      ENV NODE_ENV=production

      WORKDIR ${BUILD_PATH}

      COPY --from=development ${BUILD_PATH} .

      # Re-build in Prod Mode
      RUN npm run clean
      RUN npm run build

      # Re-build modules in Prod Mode
      RUN rm -rf node_modules
      RUN npm ci --legacy-peer-deps

##########################################################################################################################################
# Stage: Production Environment
# - Copies build to clean node env

FROM base AS production

      # Import into Stage
      ARG BUILD_PATH
      ARG RUN_PATH

      ENV NODE_ENV=production

      WORKDIR ${RUN_PATH}

      # Copy package manifest and build from `production-build`
      COPY --chown=node:node ./package*.json ./

      COPY --from=production-build --chown=node:node ${BUILD_PATH}/dist/ ./
      COPY --from=production-build --chown=node:node ${BUILD_PATH}/node_modules ./node_modules

      RUN chown -R node:node /home/node

      # Quick hack to disable update notifications from `npm` on runs
      USER node
      RUN npm config set update-notifier false
      # Ahhh, back to root
      USER root

      RUN npm config set update-notifier false

      ENTRYPOINT ["/bin/sh"]
      CMD ["npm", "start"]
