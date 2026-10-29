FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q dependency:go-offline
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre-alpine
RUN apk add --no-cache curl \
  && adduser -D -u 10001 appuser
WORKDIR /app
COPY --from=build /app/target/app.jar /app/app.jar
RUN chown appuser:appuser /app/app.jar
USER appuser
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=30s \
  CMD curl -f http://127.0.0.1:3001/api/health || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
