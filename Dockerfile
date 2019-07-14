FROM eipwork/jdk:1.0.0

ARG JAR_FILE_NAME=svc-auth-0.0.1-SNAPSHOT.jar
ARG PORT=9701

COPY ./docker/sentinel-dashboard-1.6.0.jar /eip-work/sentinel-dashboard-1.6.0.jar

ENV CLASSPATH=/eip-work/lib

EXPOSE $PORT
EXPOSE $MANAGEMENT_PORT

WORKDIR /eip-work

ENTRYPOINT ["java", "-Dserver.port=9701", "-Dcsp.sentinel.dashboard.server=localhost:9701", "-Dproject.name=sentinel-dashboard", "-jar", "/eip-work/sentinel-dashboard-1.6.0.jar"]