#! /usr/bin/env python3
import pandas as pd
import joblib
import boto3
import json
import os
import sys
from custom_transformers import OrderedTagVectorizer

bucket_name = os.environ.get('TRAINING_DATA_BUCKET_NAME')
pipeline_filename = 'complete_pipeline.joblib'
lambda_tmp_dir = '/tmp'
pipeline_full_filename = f'{lambda_tmp_dir}/{pipeline_filename}'

def handler(event, context):
  print(f'Event: {event}')
  articles = pd.DataFrame([event])
  userId = event['userId']

  boto3.setup_default_session()
  try:
    pipeline = joblib.load(pipeline_full_filename)
    print("Pipeline loaded from /tmp")
  except:
    s3 = boto3.client('s3')
    key = f'{userId}/{pipeline_filename}'
    print('Pipeline loaded from S3')
    try:
      s3.download_file(bucket_name, key, pipeline_full_filename)
    except Exception as e:
      print(f'Could not find a pipeline for user {userId}, error: {e}')
      return {
        'statusCode': 404,
        'body': json.dumps(f'Could not find a pipeline for user {userId}')
      }
  pipeline = joblib.load(pipeline_full_filename)
  ## Todo handle when there is no pipeline in s3
  expected_keys =['title', 'tags', 'summary'] 

  if not 'summary' in articles.columns:
    articles['summary'] = ''
  if not 'tags' in articles.columns:
    articles['tags'] = []

  for column in articles.columns:
    if column not in expected_keys:
      articles.drop(column, axis=1, inplace=True, errors='ignore')


  preprocessor = pipeline.named_steps['preprocessor']
  classifier = pipeline.named_steps['classifier']

  X_transformed = preprocessor.transform(articles)

  probabilities = classifier.predict_proba(X_transformed)
  class_labels = classifier.classes_
  print(f'Probabilities: {probabilities}')
  print(f'Class labels: {class_labels}')

  result = {}
  for i in range(len(class_labels)):
    if str(class_labels[i]) == '-1':
      result['dislike'] = probabilities[0][i]
    elif str(class_labels[i]) == '0':
      result['neutral'] = probabilities[0][i]
    else:
      result['like'] = probabilities[0][i]
  
  return {
    'statusCode': 200,
    'body': result
  }

if __name__ == '__main__':
  # If anything was piped to the app use that input from the pipe
  is_input_in_pipe = not os.isatty(0)
  input_data = """
  {
    "_id": "66af3505ea76309af7926b5e",
    "href": "https://www.abc.net.au/news/2024-08-04/housing-is-a-human-right-says-former-vic-supreme-court-judge/104179612",
    "feedUrl": "https://hnrss.org/newest?points=20",
    "userId": "localhostUser",
    "content": "\\n<p>Article URL: <a href=\\"https://www.abc.net.au/news/2024-08-04/housing-is-a-human-right-says-former-vic-supreme-court-judge/104179612\\">https://www.abc.net.au/news/2024-08-04/housing-is-a-human-right-says-former-vic-supreme-court-judge/104179612</a></p>\\n<p>Comments URL: <a href=\\"https://news.ycombinator.com/item?id=41151147\\">https://news.ycombinator.com/item?id=41151147</a></p>\\n<p>Points: 26</p>\\n<p># Comments: 20</p>\\n",
    "createdAt": "2024-08-04T08:00:04.933Z",
    "date": "2024-08-04T04:30:21.000Z",
    "isLiked": null,
    "isRead": false,
    "isSaved": false,
    "summary": "Former Victorian Supreme Court judge Kevin Bell argues that housing should be treated as a human right in Australia, describing the current housing situation as a socio-economic disaster rather than a crisis. In his book, \\"Housing: The Great Australian Right,\\" Bell critiques the focus on housing as a commodity for private gain, which he sees as a fundamental problem. He recalls a time when government-supported social housing was more prevalent, emphasizing that the current system disproportionately benefits property owners while leaving many without affordable housing. Bell highlights the connections between housing and broader societal issues, including mental health and social justice, and advocates for a national housing strategy that emphasizes human rights and comprehensive legislative support to address these systemic failures.",
    "synchedAt": "2024-08-04T08:00:11.379Z",
    "tags": ["rights", "system", "homelessness", "government", "values"],
    "title": "Australia must treat housing as a human right: Former State Supreme Court judge",
    "updatedAt": "2024-08-04T08:00:04.933Z"
  }
  """
  if is_input_in_pipe:
    input_data = sys.stdin.read()
  input_data = json.loads(input_data)
  result = handler(input_data, None)
  print(result)