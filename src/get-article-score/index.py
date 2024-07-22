#! /usr/bin/env python3
from datetime import timezone
import pandas as pd
import joblib
import boto3
import json
import os

bucket_name = os.environ.get('TRAINING_DATA_BUCKET_NAME')
pipeline_filename = 'complete_pipeline.joblib'
lambda_tmp_dir = '/tmp'
pipeline_full_filename = f'{lambda_tmp_dir}/{pipeline_filename}'

def handler(event, context):
  print(f'Event: {event}')
  articles = pd.DataFrame([event])
  userId = event['userId']

  # Check the lit-feed-dev-article-models bucket for the model
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

  articles['createdat'] = pd.to_datetime(articles['createdAt'])
  articles['date'] = pd.to_datetime(articles['date'])
  articles['updatedat'] = pd.to_datetime(articles['updatedAt'])
  articles['feedurl'] = articles['feedUrl'].fillna('').astype(str)
  articles['isread'] = articles['isRead'].astype(bool)
  articles['issaved'] = articles['isSaved'].astype(bool)
  articles['isliked'] = articles['isLiked'].astype(bool)
  if 'content' in articles.columns:
    articles['textcontent'] = articles['content'].fillna('').astype(str)
  else:
    articles['textcontent'] = ''
  if 'summary' in articles.columns:
    articles['summary'] = articles['summary'].fillna('').astype(str)
  else:
    articles['summary'] = ''
  if 'tags' in articles.columns:
    articles['tags'] = articles['tags'].fillna('').astype(str)
  else:
    articles['tags'] = ''
  articles.drop(['content', 'isRead', 'isSaved', 'isLiked', 'createdAt', 'updatedAt', 'feedUrl'], axis=1, inplace=True)


  preprocessor = pipeline.named_steps['preprocessor']
  classifier = pipeline.named_steps['classifier']

  X_transformed = preprocessor.transform(articles)

  probabilities = classifier.predict_proba(X_transformed)
  class_labels = classifier.classes_
  print(f'Probabilities: {probabilities}')
  print(f'Class labels: {class_labels}')

  result = {}
  for i in range(len(class_labels)):
    if class_labels[i] == -1:
      result['dislike'] = probabilities[0][i]
    elif class_labels[i] == 0:
      result['neutral'] = probabilities[0][i]
    else:
      result['like'] = probabilities[0][i]
  
  return {
    'statusCode': 200,
    'body': result
  }

if __name__ == '__main__':
  result = handler({'_id': '669ca9a52bb30006432860bc', 'feedUrl': 'https://hnrss.org/newest?points=10', 'href': 'https://x.com/', 'userId': '65a90719332e28717a201fef', 'content': '\n<p>Article URL: <a href="https://x.com/">https://x.com/</a></p>\n<p>Comments URL: <a href="https://news.ycombinator.com/item?id=41022408">https://news.ycombinator.com/item?id=41022408</a></p>\n<p>Points: 80</p>\n<p># Comments: 66</p>\n', 'createdAt': '2024-07-21T06:24:37.774Z', 'date': '2024-07-21T04:37:28.000Z', 'isLiked': True, 'isRead': True, 'isSaved': False, 'synchedAt': '2024-07-21T06:24:37.988Z', 'title': 'X.com refuses to open with Firefox strict tracking protection enabled', 'updatedAt': '2024-07-21T06:59:11.428Z'}, None)
  print(result)