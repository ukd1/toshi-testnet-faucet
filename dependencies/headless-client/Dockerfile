FROM openjdk:8

WORKDIR /usr/src/headless-client

RUN git clone https://github.com/toshiapp/toshi-headless-client.git . && git fetch --tags && git checkout tags/v0.1.4

RUN ./gradlew ToshiHeadlessClientCapsule

CMD ["java", "-jar", "build/libs/toshi-headless-0.1.4-capsule.jar", "config.yml"]
