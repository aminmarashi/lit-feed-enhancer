#! /usr/bin/env python3
import pandas as pd
import io
import joblib
import boto3
import json
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import SGDClassifier
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.feature_extraction.text import HashingVectorizer
from sklearn.pipeline import Pipeline
from sklearn.model_selection import KFold
from sklearn.model_selection import cross_val_score
import awswrangler as wr
import os

pipeline_filename = 'complete_pipeline.joblib'

def lambda_handler(event, context):
  # Get userId from the event
  article = event['article']
  userId = article['userId']

  boto3.setup_default_session(region_name='eu-west-1', profile_name='dev')

  # Check the lit-feed-dev-article-models bucket for the model
  s3 = boto3.client('s3')
  bucket_name = 'lit-feed-dev-misc'
  cache_filename = 'athena_cache.csv'

  print('Loading training data')
  if os.path.exists(cache_filename):
    data = pd.read_csv(cache_filename)
    print('loaded data from cache')
  else:
    query = f"select distinct b.link, u.title, b.tags, b.textcontent, u.userid, u.issaved, u.isliked, u.isread, b.summary, u.feedurl from default.user_articles u join default.backend_articles b on u.href = b.link where u.userId = '{userId}'"
    data = wr.athena.read_sql_query(query, database='default')
    data.to_csv(cache_filename, index=False)
    print('loaded data from Athena')

  data['textcontent'] = data['textcontent'].fillna('').astype(str)
  data['tags'] = data['tags'].fillna('').astype(str)
  data['summary'] = data['summary'].fillna('').astype(str)
  data['title'] = data['title'].fillna('').astype(str)


  # mask = data['isliked'].isna()
  # rows_to_drop = data[mask].sample(frac=0.7).index
  # data = data.drop(index=rows_to_drop)
    
  y = data['isliked'].apply(lambda x: 0 if pd.isna(x) else 1 if x else -1)
  # If issaved is True, set y to 1
  y = y.where(data['issaved'] == False, 1) # change to 1 if saved is true

  print('Starting the training with the following outputs')
  y_equal_1 = y[y == 1]
  y_equal_0 = y[y == 0]
  y_equal_m1 = y[y == -1]
  print(f"y = 1: {len(y_equal_1)}")
  print(f"y = 0: {len(y_equal_0)}")
  print(f"y = -1: {len(y_equal_m1)}")

  preprocessor = ColumnTransformer(
  transformers=[
    ('txt', TfidfVectorizer(), 'textcontent'),
    ('saved', OneHotEncoder(), ['issaved']),
    ('title', TfidfVectorizer(), 'title'),
    ('summary', TfidfVectorizer(), 'summary'), 
    ('tags', TfidfVectorizer(), 'tags'),
    ('url', HashingVectorizer(), 'feedurl')
  ])
  sgd_classifier = SGDClassifier(loss='modified_huber') # Replace 'log_loss' with 'modified_huber' or another suitable loss function for skewed data
  pipeline = Pipeline([
    ('preprocessor', preprocessor),
    ('classifier', sgd_classifier)
  ])

  pipeline.fit(data, y)

  k_fold = KFold(n_splits=4)

  scores = pipeline.score(data, y)
  cross_val_scores = cross_val_score(pipeline, data, y, cv=k_fold, n_jobs=-1)

  print(cross_val_scores[:3])

  return {
    'statusCode': 200,
    'body': json.dumps('Hello from Lambda!')
  }

if __name__ == '__main__':
  lambda_handler({
    'article': {'userId': '65a90719332e28717a201fef'}
    }, None)