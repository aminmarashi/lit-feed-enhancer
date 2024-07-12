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
  article = pd.DataFrame(event, index=[0])
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
    except:
      print(f'Could not find a pipeline for user {userId}')
      return {
        'statusCode': 404,
        'body': json.dumps(f'Could not find a pipeline for user {userId}')
      }
  pipeline = joblib.load(pipeline_full_filename)
  ## Todo handle when there is no pipeline in s3

  article['textcontent'] = article['textcontent'].fillna('').astype(str)
  article['tags'] = article['tags'].fillna('').astype(str)
  article['summary'] = article['summary'].fillna('').astype(str)
  article['title'] = article['title'].fillna('').astype(str)

  probabilities = pipeline.predict_proba(article)
  
  return {
    'statusCode': 200,
    'body': json.dumps({
      '1': probabilities[0][1],
      '0': probabilities[0][0],
      '1': probabilities[0][2]
    })
  }

if __name__ == '__main__':
  result = handler({
    'articleid': '65e1909c15e55e8deb1fd47e',
    'feedurl': 'https://hnrss.org/newest?points=100',
    'href': 'https://twitter.com/nixcraft/status/1763124892986474689',
    'textcontent': 'article url: https://twitter.com/nixcraft/status/1763124892986474689\n' +
      'comments url: https://news.ycombinator.com/item?id=39558365\n' +
      'points: 162\n' +
      '# comments: 69',
    'createdat': '2024-03-01t08:23:55.158z',
    'date': '2024-03-01t03:53:26.000z',
    'isread': True,
    'issaved': False,
    'summary': 'article url: https://twitter.com/nixcraft/status/1763124892986474689\n' +
      'comments url: https://news.ycombinator.com/item?id=39558365\n' +
      'points: 162\n' +
      '# comments: 69',
    'title': 'docusign just admitted that they use customer data to train ai',
    'updatedat': '2024-05-17t06:02:40.239z',
    'feedid': '65e03508114dfe73e550d0b3',
    'feedname': 'hn 100',
    'synchedat': '2024-03-05t08:53:34.086z',
    'isliked': None,
    'userId': '65a90719332e28717a201fef',
    'tags': None,
  }, None)
  print(result)