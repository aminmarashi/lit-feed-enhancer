FROM public.ecr.aws/lambda/python:3.12

# Create a directory for your application
RUN mkdir -p /app/dependencies
WORKDIR /app

# Copy your requirements.txt file
COPY requirements.txt ${LAMBDA_TASK_ROOT}
WORKDIR ${LAMBDA_TASK_ROOT}

RUN pip install -r requirements.txt

COPY custom_transformers.py ${LAMBDA_TASK_ROOT}
COPY index.py ${LAMBDA_TASK_ROOT}

CMD ["index.handler"]
