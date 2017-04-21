FROM openjdk:8

WORKDIR /usr/src/headless-client

RUN git clone https://github.com/tokenbrowser/token-headless-client.git .
RUN git fetch --tags
RUN git checkout tags/v0.1.0

RUN ./gradlew TokenHeadlessClientCapsule

CMD ["java", "-jar", "build/libs/token-headless-0.1.0-capsule.jar", "config.yml"]
