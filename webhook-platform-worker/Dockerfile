# Build stage
#
# Pinned to the *build* platform, not the target one. The artifact this stage
# produces is a JAR, which is architecture-independent, so building it once
# natively and copying it into each target image is equivalent to — and far
# faster than — running Maven under QEMU emulation once per architecture.
FROM --platform=$BUILDPLATFORM maven:3.9-eclipse-temurin-17-alpine AS build

WORKDIR /workspace

# Copy entire project (needed for multi-module Maven build)
COPY . .

# Build only common and worker modules
RUN mvn -pl webhook-platform-common,webhook-platform-worker -am clean package -DskipTests

# Runtime stage
#
# Jammy rather than Alpine: Eclipse Temurin publishes its Alpine (musl) images
# for linux/amd64 only, so the linux/arm64 half of the multi-arch build in
# .github/workflows/docker-publish.yml could never resolve it —
# "no match for platform in manifest". The Jammy variant is published for both.
FROM eclipse-temurin:17-jre-jammy

WORKDIR /app

# Create non-root user for security. groupadd/useradd rather than Alpine's
# BusyBox addgroup/adduser, which do not exist on this base.
RUN groupadd -g 1001 appgroup && useradd -u 1001 -g appgroup -m -s /usr/sbin/nologin appuser
USER appuser

# Copy JAR from build stage
COPY --from=build /workspace/webhook-platform-worker/target/webhook-platform-worker-*.jar app.jar

EXPOSE 8081

# JVM tuning for containers (worker needs more heap for async processing)
ENV JAVA_OPTS="-XX:+UseContainerSupport \
    -XX:MaxRAMPercentage=75.0 \
    -XX:InitialRAMPercentage=50.0 \
    -XX:+UseG1GC \
    -XX:+UseStringDeduplication \
    -XX:MaxGCPauseMillis=200 \
    -XX:+ParallelRefProcEnabled \
    -Djava.security.egd=file:/dev/./urandom \
    -Dfile.encoding=UTF-8 \
    -Dreactor.netty.ioWorkerCount=4"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
