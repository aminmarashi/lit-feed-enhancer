#! /usr/bin/env python3
from datetime import timezone
import pandas as pd
import joblib
import boto3
import json
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.feature_extraction.text import HashingVectorizer
from sklearn.linear_model import SGDClassifier
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.feature_extraction import FeatureHasher
from sklearn.pipeline import Pipeline
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
  try:
    key = f'{userId}/{pipeline_filename}'
    s3.download_file(bucket_name, key, pipeline_full_filename)
    pipeline = joblib.load(pipeline_full_filename)
    print("pipeline loaded from s3")
  except:
    preprocessor = ColumnTransformer(
      transformers=[
        ('txt', TfidfVectorizer(), 'textcontent'),
        ('saved', OneHotEncoder(), ['issaved']),
        ('title', TfidfVectorizer(), 'title'),
        ('summary', TfidfVectorizer(), 'summary'), 
        ('tags', TfidfVectorizer(), 'tags'),
        ('url', HashingVectorizer(), 'feedurl')
      ]
    )
    sgd_classifier = SGDClassifier(loss='modified_huber') # Replace 'log_loss' with 'modified_huber' or another suitable loss function for skewed data
    pipeline = Pipeline([
      ('preprocessor', preprocessor),
      ('classifier', sgd_classifier)
    ])
    print('pipeline created from scratch')

  print('Loading training data from s3')
  if os.path.exists(athena_cache_full_filename):
    print('loaded data from cache')
    key = f'{userId}/{athena_cache_filename}'
    # Check if the athena cache is less than a day old
    athenaCacheFileInformation = s3.get_object(Bucket=bucket_name, Key=key)
    if athenaCacheFileInformation.get('LastModified') is not None:
      athenaCacheFileTimestampFromS3 = athenaCacheFileInformation['LastModified']
      athenaCacheFileTimestampFromS3 = athenaCacheFileTimestampFromS3.replace(tzinfo=timezone.utc)
    else:
      athenaCacheFileTimestampFromS3 = pd.Timestamp.now(timezone.utc)
    if (athenaCacheFileTimestampFromS3 - pd.Timestamp.now(timezone.utc)).total_seconds() < 86400:
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


  # mask = data['isliked'].isna()
  # rows_to_drop = data[mask].sample(frac=0.7).index
  # data = data.drop(index=rows_to_drop)
    
  y = data['isliked'].apply(lambda x: 0 if x is None else 1 if x else -1)
  # If issaved is True, set y to 1
  y = y.where(data['issaved'] == False, 1) # change to 1 if saved is true

  print('Starting the training with the following outputs')
  y_equal_1 = y[y == 1]
  y_equal_0 = y[y == 0]
  y_equal_m1 = y[y == -1]
  print(f"y = 1: {len(y_equal_1)}")
  print(f"y = 0: {len(y_equal_0)}")
  print(f"y = -1: {len(y_equal_m1)}")
  pipeline.fit(data, y)

  # Save the model and vectorizer back to S3
  print('Saving the data in S3')
  joblib.dump(pipeline, pipeline_full_filename)
  s3.upload_file(pipeline_full_filename, bucket_name, f'{userId}/{pipeline_filename}')

  return {
    'statusCode': 200,
    'body': json.dumps({
      'message': 'Training completed successfully',
      'userId': userId,
      'stats': {
        'y = 1': len(y_equal_1),
        'y = 0': len(y_equal_0),
        'y = -1': len(y_equal_m1)
      }
    })
  }

if __name__ == '__main__':
  result = handler({
    'userId': '65a90719332e28717a201fef'
  }, None)
  print(result)