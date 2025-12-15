FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

COPY target/webhook-platform-api-*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
