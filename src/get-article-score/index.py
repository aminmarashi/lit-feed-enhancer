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
  article = pd.DataFrame([event])
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

  article['issaved'] = article['isSaved'].fillna(False).astype(bool)
  article['feedurl'] = article['feedUrl'].fillna('').astype(str)
  if 'content' in article:
    article['textcontent'] = article['content'].fillna('').astype(str)
  else:
    article['textcontent'] = ''
  if 'tags' in article:
    article['tags'] = article['tags'].fillna('').astype(str)
  else:
    article['tags'] = ''
  if 'summary' in article:
    article['summary'] = article['summary'].fillna('').astype(str)
  else:
    article['summary'] = ''
  article['title'] = article['title'].fillna('').astype(str)

  prediction = pipeline.predict(article)
  probabilities = pipeline.predict_proba(article)
  print(f'Prediction: {prediction}')
  print(f'Probabilities: {probabilities}')
  
  return {
    'statusCode': 200,
    'body': json.dumps({
      '-1': probabilities[0][0],
      '0': probabilities[0][1],
      '1': probabilities[0][2],
    })
  }

if __name__ == '__main__':
  result = handler({
    'articleId': '65e1909c15e55e8deb1fd47e',
    'feedUrl': 'https://hnrss.org/newest?points=100',
    'href': 'https://twitter.com/nixcraft/status/1763124892986474689',
    'content': 'article url: https://twitter.com/nixcraft/status/1763124892986474689\n' +
      'comments url: https://news.ycombinator.com/item?id=39558365\n' +
      'points: 162\n' +
      '# comments: 69',
    'createdAt': '2024-03-01t08:23:55.158z',
    'date': '2024-03-01t03:53:26.000z',
    'isRead': True,
    'isSaved': False,
    'summary': 'article url: https://twitter.com/nixcraft/status/1763124892986474689\n' +
      'comments url: https://news.ycombinator.com/item?id=39558365\n' +
      'points: 162\n' +
      '# comments: 69',
    'title': 'docusign just admitted that they use customer data to train ai',
    'updatedAt': '2024-05-17t06:02:40.239z',
    'feedId': '65e03508114dfe73e550d0b3',
    'feedName': 'hn 100',
    'synchedAt': '2024-03-05t08:53:34.086z',
    'isLiked': None,
    'userId': '65a90719332e28717a201fef',
    'tags': None,
    'openDuration': 8578928
  }, None)
  print(result)