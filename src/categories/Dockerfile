FROM public.ecr.aws/lambda/python:3.12

RUN mkdir -p /app/dependencies
WORKDIR /app

COPY requirements.txt ${LAMBDA_TASK_ROOT}
WORKDIR ${LAMBDA_TASK_ROOT}

RUN pip install torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install -r requirements.txt

COPY index.py ${LAMBDA_TASK_ROOT}

CMD ["index.handler"]
