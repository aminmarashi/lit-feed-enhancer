FROM public.ecr.aws/lambda/nodejs:20

WORKDIR ${LAMBDA_TASK_ROOT}

# Install wget, tar, and gzip using microdnf
RUN microdnf install -y wget tar gzip && \
    # Download and extract mongodump
    wget -O mongo-tools.tgz https://fastdl.mongodb.org/tools/db/mongodb-database-tools-amazon2-x86_64-100.10.0.tgz && \
    tar xzf mongo-tools.tgz && \
    mv mongodb-database-tools-*/bin . && \
    # Cleanup: remove the downloaded archive and extracted directory
    rm -rf mongo-tools.tgz mongodb-database-tools-* && \
    # Uninstall wget, tar, and gzip
    microdnf remove -y wget tar gzip && \
    # Remove microdnf cache to reduce image size
    microdnf clean all

# Copy the application code
COPY index.js ${LAMBDA_TASK_ROOT}

CMD ["index.handler"]
