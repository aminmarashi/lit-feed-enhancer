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

  articles['isread'] = articles['isRead']
  articles['userid'] = articles['userId']
  articles['isliked'] = articles['isLiked']
  articles['issaved'] = articles['isSaved'].fillna(False).astype(bool)
  articles['feedurl'] = articles['feedUrl'].fillna('').astype(str)
  [articles.pop(key) for key in ['isLiked', 'isSaved', 'feedUrl', 'userId', 'isRead']]
  if 'content' in articles:
    articles['textcontent'] = articles['content'].fillna('').astype(str)
    articles.pop('content')
  else:
    articles['textcontent'] = ''
  if 'tags' in articles:
    articles['tags'] = articles['tags'].fillna('').astype(str)
  else:
    articles['tags'] = ''
  if 'summary' in articles:
    articles['summary'] = articles['summary'].fillna('').astype(str)
  else:
    articles['summary'] = ''
  articles['title'] = articles['title'].fillna('').astype(str)

  probabilities = pipeline.predict_proba(articles)
  print(f'Probabilities: {probabilities}')
  
  return {
    'statusCode': 200,
    'body': {
      'dislike': probabilities[0][0],
      'neutral': probabilities[0][1],
      'like': probabilities[0][2],
    }
  }

if __name__ == '__main__':
  result = handler({'_id': '669ca9a52bb30006432860bc', 'feedUrl': 'https://hnrss.org/newest?points=10', 'href': 'https://x.com/', 'userId': '65a90719332e28717a201fef', 'content': '\n<p>Article URL: <a href="https://x.com/">https://x.com/</a></p>\n<p>Comments URL: <a href="https://news.ycombinator.com/item?id=41022408">https://news.ycombinator.com/item?id=41022408</a></p>\n<p>Points: 80</p>\n<p># Comments: 66</p>\n', 'createdAt': '2024-07-21T06:24:37.774Z', 'date': '2024-07-21T04:37:28.000Z', 'isLiked': True, 'isRead': True, 'isSaved': False, 'synchedAt': '2024-07-21T06:24:37.988Z', 'title': 'X.com refuses to open with Firefox strict tracking protection enabled', 'updatedAt': '2024-07-21T06:59:11.428Z'}, None)
  print(result)