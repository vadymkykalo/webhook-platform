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

# Copy JAR from build stage
COPY --from=build /workspace/webhook-platform-worker/target/webhook-platform-worker-*.jar app.jar

EXPOSE 8081

ENTRYPOINT ["java", "-jar", "app.jar"]
