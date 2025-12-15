FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY target/webhook-platform-test-receiver-*.jar app.jar
EXPOSE 8082
ENTRYPOINT ["java", "-jar", "app.jar"]
