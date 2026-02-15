# Build stage
FROM maven:3.9-eclipse-temurin-17-alpine AS build

WORKDIR /workspace

# Copy entire project (needed for multi-module Maven build)
COPY . .

# Build only common and worker modules
RUN mvn -pl webhook-platform-common,webhook-platform-worker -am clean package -DskipTests

# Runtime stage
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
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
