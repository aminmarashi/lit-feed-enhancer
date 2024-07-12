#! /usr/bin/env python3
from datetime import timezone
import pandas as pd
import joblib
import boto3
import json
import awswrangler as wr
import os

bucket_name = 'lit-feed-dev-article-training-data'
pipeline_filename = 'complete_pipeline.joblib'
athena_cache_filename = 'athena_cache.csv'
lambda_tmp_dir = '/tmp'
pipeline_full_filename = f'{lambda_tmp_dir}/{pipeline_filename}'
athena_cache_full_filename = f'{lambda_tmp_dir}/{athena_cache_filename}'

def handler(event, context):
  # Get userId from the event
  userId = event['userId']

  # Check the lit-feed-dev-article-models bucket for the model
  boto3.setup_default_session()
  s3 = boto3.client('s3')
  print('Loading pipeline from S3')
  key = f'{userId}/{pipeline_filename}'
  s3.download_file(bucket_name, key, pipeline_full_filename)
  pipeline = joblib.load(pipeline_full_filename)
  print("pipeline loaded from s3")

  print('Loading training data from s3')
  if os.path.exists(athena_cache_full_filename):
    print('loaded data from cache')
    key = f'{userId}/{athena_cache_filename}'
    athenaCacheFileInformation = s3.get_object(Bucket=bucket_name, Key=key)
    if athenaCacheFileInformation.get('LastModified') is not None:
      athenaCacheFileTimestampFromS3 = athenaCacheFileInformation['LastModified']
      athenaCacheFileTimestampFromS3 = athenaCacheFileTimestampFromS3.replace(tzinfo=timezone.utc)
    else:
      athenaCacheFileTimestampFromS3 = pd.Timestamp.now(timezone.utc)
    # Check if the athena cache is less than 1 minute old, then use cache
    if (athenaCacheFileTimestampFromS3 - pd.Timestamp.now(timezone.utc)).total_seconds() < 60:
      s3.download_file(bucket_name, key, athena_cache_full_filename)
      data = pd.read_csv(athena_cache_full_filename)
      print("pipeline loaded from s3")
    else:
      query = f"select distinct b.link, u.title, b.tags, b.textcontent, u.userid, u.issaved, u.isliked, u.isread, b.summary, u.feedurl from default.user_articles u join default.backend_articles b on u.href = b.link where u.userId = '{userId}'"
      data = wr.athena.read_sql_query(query, database='default')
      data.to_csv(athena_cache_full_filename, index=False)
      s3.upload_file(athena_cache_full_filename, bucket_name, f'{userId}/{athena_cache_filename}')
      print('loaded data from Athena')
  else:
    query = f"select distinct b.link, u.title, b.tags, b.textcontent, u.userid, u.issaved, u.isliked, u.isread, b.summary, u.feedurl from default.user_articles u join default.backend_articles b on u.href = b.link where u.userId = '{userId}'"
    data = wr.athena.read_sql_query(query, database='default')
    data.to_csv(athena_cache_full_filename, index=False)
    s3.upload_file(athena_cache_full_filename, bucket_name, f'{userId}/{athena_cache_filename}')
    print('loaded data from Athena')

  data['textcontent'] = data['textcontent'].fillna('').astype(str)
  data['tags'] = data['tags'].fillna('').astype(str)
  data['summary'] = data['summary'].fillna('').astype(str)
  data['title'] = data['title'].fillna('').astype(str)

  predictions = pipeline.predict(data)

  probabilities = pipeline.predict_proba(data)
  
  liked_articles = []
  disliked_articles = []
  neutral_articles = []
  for i, prediction in enumerate(predictions):
    if prediction == 1:
      liked_articles.append({
        'link': data.iloc[i]['link'],
        'probability': probabilities[i][1]
      })
    elif prediction == -1:
      disliked_articles.append({
        'link': data.iloc[i]['link'],
        'probability': probabilities[i][-1]
      })
    else:
      neutral_articles.append({
        'link': data.iloc[i]['link'],
        'probability': probabilities[i][0]
      })


  return {
    'statusCode': 200,
    'body': json.dumps({
      'message': 'Predictions completed successfully',
      'userId': userId,
      'liked_articles': liked_articles,
      'disliked_articles': disliked_articles,
      'neutral_articles': neutral_articles
    })
  }

if __name__ == '__main__':
  result = handler({
    'userId': '65a90719332e28717a201fef'
  }, None)
  print(result)