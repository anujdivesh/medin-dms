FROM docker.elastic.co/elasticsearch/elasticsearch:8.13.0

# Set environment variables
ENV discovery.type=single-node
ENV ES_JAVA_OPTS="-Xms1g -Xmx1g"
ENV xpack.security.enabled=false

# Expose Elasticsearch ports
EXPOSE 9200 9300
