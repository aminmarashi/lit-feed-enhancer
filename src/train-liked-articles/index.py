#! /usr/bin/env python3
import json
import pandas as pd
import joblib
import boto3
import json
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
import awswrangler as wr
import os
import numpy as np
from imblearn.over_sampling import RandomOverSampler
from custom_transformers import OrderedTagVectorizer
from sklearn.linear_model import SGDClassifier

## TODO: Make these env vars
pipeline_filename = 'complete_pipeline.joblib'
athena_cache_filename = 'athena_cache.csv'
lambda_tmp_dir = '/tmp'
bucket_name = os.environ.get('TRAINING_DATA_BUCKET_NAME', 'lit-feed-dev-article-training-data')
is_test_run = os.environ.get('TEST_RUN', 'False') == 'True'
train_from_scratch = os.environ.get('TRAIN_FROM_SCRATCH', 'False') == 'True'
testing_sample_fraction = float(os.environ.get('TESTING_SAMPLE_FRACTION', '0.2'))

def check_file_exists_in_s3(s3, Bucket, Key):
  try:
    s3.head_object(Bucket=Bucket, Key=Key)
    return True
  except:
    return False

def count_identified_articles(articles, article_probabilities, category):
  identified_articles = 0
  threshold = 0.2
  for i in range(len(articles)):
    if category == 'liked':
      if article_probabilities[i][2] - article_probabilities[i][0] > threshold:
        identified_articles += 1
    elif category == 'disliked':
      if article_probabilities[i][0] - article_probabilities[i][2] > threshold:
        identified_articles += 1
  return identified_articles

def handler(event, context):
  article = json.loads(event.get('Records')[0].get('body'))

  userId = article['userId']
  tmp_user_dir = f'{lambda_tmp_dir}/{userId}'
  if not os.path.exists(tmp_user_dir):
    os.makedirs(tmp_user_dir)
  athena_cache_full_filename = f'{tmp_user_dir}/{athena_cache_filename}'
  pipeline_full_filename = f'{tmp_user_dir}{pipeline_filename}'
  athena_cache_in_s3 = f'{userId}/{athena_cache_filename}'
  if 'isSaved' in article:
    article['issaved'] = article['isSaved']
    article.pop('isSaved')
  if 'isLiked' in article:
    article['isliked'] = article['isLiked']
    article.pop('isLiked')
  if not 'summary' in article:
    article['summary'] = ''

  boto3.setup_default_session()
  s3 = boto3.client('s3')
  shouldLoadFromScratch = True
  pipeline = None
  if not is_test_run and not train_from_scratch:
    print('Loading pipeline')
    try:
      if os.path.exists(pipeline_full_filename):
        pipeline = joblib.load(pipeline_full_filename)
        print("Pipeline loaded from /tmp")
      else:
        key = f'{userId}/{pipeline_filename}'
        s3.download_file(bucket_name, key, pipeline_full_filename)
        pipeline = joblib.load(pipeline_full_filename)
        print("Pipeline loaded from s3")
      shouldLoadFromScratch = False
    except Exception as e:
      print('Pipeline will have to be created from scratch: ' + str(e))
  else:
    print('Running locally, training will be done from scratch')

  if shouldLoadFromScratch:
    if os.path.exists(athena_cache_full_filename):
      data = pd.read_csv(athena_cache_full_filename)
      print('Loaded data from local Athena cache')
    elif check_file_exists_in_s3(s3, Bucket=bucket_name, Key=athena_cache_in_s3):
      print('Loading training data from S3')
      s3.download_file(bucket_name, athena_cache_in_s3, athena_cache_full_filename)
      data = pd.read_csv(athena_cache_full_filename)
      print('Loaded data from S3 Athena cache')
    else:
      print('Loading training data from Athena')
      query = f"select distinct u.title, u.userid, u.issaved, u.isliked, u.action, b.summary from feed.user_articles u join feed.backend_articles b on u.href = b.link where u.userId = '{userId}' and (u.isliked is not null or u.action != 'markAllAsRead' or u.action is null)"
      data = wr.athena.read_sql_query(query, database='feed')
      data.to_csv(athena_cache_full_filename, index=False)
      print('Storing Athena results in S3')
      s3.upload_file(athena_cache_full_filename, bucket_name, athena_cache_in_s3)
      print('Loaded data from Athena')
  else:
    print('Training data loaded from the event')
    data = pd.DataFrame([article])

  data['summary'] = data['summary'].fillna('').astype(str)
  labeled_data = data[data['isliked'].notna()]
  neutral_data = data[data['isliked'].isna()]
  if len(labeled_data) > 0:
    if len(neutral_data) >= len(labeled_data):
      neutral_sample = neutral_data.sample(n=len(labeled_data), random_state=42)
    else:
      neutral_sample = neutral_data
    data = pd.concat([labeled_data, neutral_sample])
  else:
    data = neutral_data

  if is_test_run:
    print(f"Total articles: {len(data)}")
    print(f"Testing sample fraction: {testing_sample_fraction}")
    data_for_testing = data.sample(frac=testing_sample_fraction)
    print(f"Testing on {len(data_for_testing)} articles")
    data = data.drop(data_for_testing.index)
    print(f"Training on {len(data)} articles")

  # Define target y: liked (1) if isliked is True, disliked (-1) if False.
  y = data['isliked'].apply(lambda x: 0 if pd.isna(x) or x == None else 1 if x else -1)
  # Override y to 1 if issaved is True.
  y = y.where(data['issaved'] == False, 1)

  # Keep only the necessary columns.
  for column in data.columns:
    if column not in ['title', 'summary']:
      data = data.drop(column, axis=1)
  if is_test_run:
    if column not in ['title', 'summary']:
      data_for_testing = data_for_testing.drop(column, axis=1)

  if shouldLoadFromScratch:
    if len(y[y == -1]) == 0 and len(y[y == 1]) == 0:
      print("No liked or disliked articles found")
    elif len(y[y == -1]) == 0:
      print("No disliked articles, forcing one article to be disliked")
      y.iloc[0] = -1
    elif len(y[y == 1]) == 0:
      print("No liked articles, forcing one article to be liked")
      y.iloc[0] = 1

    print('Starting training with the following outputs')
    y_equal_1 = y[y == 1]
    y_equal_0 = y[y == 0]
    y_equal_m1 = y[y == -1]
    print(f"y = 1: {len(y_equal_1)}")
    print(f"y = 0: {len(y_equal_0)}")
    print(f"y = -1: {len(y_equal_m1)}")

    # Build a preprocessor that uses two embedding transformers.
    preprocessor = ColumnTransformer(
      transformers=[
        ('title', TfidfVectorizer(max_features=10000, max_df=0.7, ngram_range=(1, 5)), 'title'),
        ('summary', TfidfVectorizer(max_features=1000000, max_df=0.7, ngram_range=(1, 5)), 'summary'),
      ]
    )

    classifier = SGDClassifier(loss='log_loss', penalty='elasticnet', alpha=0.0001, l1_ratio=0.15,
                        learning_rate='adaptive', eta0=0.01,
                        validation_fraction=0.1, n_iter_no_change=5, random_state=42)

    pipeline = Pipeline([
      ('preprocessor', preprocessor),
      ('classifier', classifier)
    ])
    pipeline.meta = {
      'labeled_count': len(labeled_data),
      'neutral_count': len(neutral_data)
    }
    print('pipeline created from scratch')

    # Oversampling
    print("Starting oversampling")
    ros = RandomOverSampler(sampling_strategy='auto')
    data_resampled, y_resampled = ros.fit_resample(data, y)

    pipeline.fit(data_resampled, y_resampled)

    print('Pipeline created and trained from scratch')
  else:
    preprocessor = pipeline.named_steps['preprocessor']
    classifier = pipeline.named_steps['classifier']
    if pipeline.meta['neutral_count'] > pipeline.meta['labeled_count']:
      drop_probability = 1 - (pipeline.meta['labeled_count'] / pipeline.meta['neutral_count'])
    else:
      drop_probability = 0

    # data is just one article, is_neutral_article can be calculated from y
    is_neutral_article = y.iloc[0] == 0
    should_skip_training = 1 if is_neutral_article and np.random.rand() < drop_probability else 0

    # Update your counts after training
    pipeline.meta['labeled_count'] += 1 if not is_neutral_article else 0
    pipeline.meta['neutral_count'] += 1 if is_neutral_article else 0

    print(f"So far processed {pipeline.meta['labeled_count']} labeled articles and {pipeline.meta['neutral_count']} neutral articles, drop probability: {drop_probability}, should skip training: {should_skip_training}")

    if not should_skip_training:
      X_transformed = preprocessor.transform(data)
      classifier.partial_fit(X_transformed, y)

  if is_test_run:
    print('Running tests')
    # Transform test data.
    articles_is_liked = data_for_testing[data_for_testing['isliked'] == True]
    articles_is_saved = data_for_testing[data_for_testing['issaved'] == True]
    liked_articles = pd.concat([articles_is_liked, articles_is_saved])
    liked_articles_probabilities = pipeline.predict_proba(liked_articles)
    predicted_disliked_articles = count_identified_articles(liked_articles, liked_articles_probabilities, 'liked')
    print(f'Wrongly identified liked articles: {predicted_disliked_articles} from {len(liked_articles)}')
    article_is_disliked = data_for_testing[data_for_testing['isliked'] == False]
    test_probs_disliked = pipeline.predict_proba(article_is_disliked)
    predicted_disliked_articles = count_identified_articles(article_is_disliked, test_probs_disliked, 'disliked')
    print(f'Wrongly identified disliked articles: {len(article_is_disliked) - predicted_disliked_articles} from {len(article_is_disliked)}')

  # Save the pipeline to S3.
  print('Saving the pipeline in S3')
  joblib.dump(pipeline, pipeline_full_filename)
  if not is_test_run:
    s3.upload_file(pipeline_full_filename, bucket_name, f'{userId}/{pipeline_filename}')
  else:
    print('Skipping S3 upload')

  return {
    'statusCode': 200,
    'body': json.dumps({
      'message': 'Training completed successfully',
      'userId': userId,
      'stats': {
        'y = 1': int(len(y[y == 1])),
        'y = -1': int(len(y[y == -1]))
      }
    })
  }

if __name__ == '__main__':
  # '245f23984f233d32b233f2f2', '245f23984f233d32b233f2f3', '65a90719332e28717a201fef', '65c808822106a2b232456a80', 'localhostUser', 'tempUserId'
  users = [ '65a90719332e28717a201fef']
  for user in users:
    result = handler({
      'Records': [{'body': json.dumps({'userId': user})}]
    }, None)
    print(result)