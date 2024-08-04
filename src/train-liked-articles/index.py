#! /usr/bin/env python3
import time
import pandas as pd
import joblib
import boto3
import json
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.feature_extraction.text import HashingVectorizer
from sklearn.linear_model import SGDClassifier
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
import awswrangler as wr
import os
import numpy as np
from sklearn.utils.class_weight import compute_class_weight
from imblearn.over_sampling import RandomOverSampler

## TODO: Make these env vars
bucket_name = 'lit-feed-dev-article-training-data'
pipeline_filename = 'complete_pipeline.joblib'
athena_cache_filename = 'athena_cache.csv'
lambda_tmp_dir = '/tmp'
athena_cache_full_filename = f'{lambda_tmp_dir}/{athena_cache_filename}'
pipeline_full_filename = f'{lambda_tmp_dir}/{pipeline_filename}'
is_test_run = os.environ.get('TEST_RUN', 'False') == 'True'
testing_sample_fraction = float(os.environ.get('TESTING_SAMPLE_FRACTION', '0.2'))
like_bias = float(os.environ.get('LIKE_BIAS', '300'))
dislike_bias = float(os.environ.get('DISLIKE_BIAS', '300'))
neutral_bias = float(os.environ.get('NEUTRAL_BIAS', '1'))
print(f"Biased by: like: {like_bias}, dislike: {dislike_bias}, neutral: {neutral_bias}")

def handler(event, context):
  article = event
  userId = article['userId']
  if 'isSaved' in article:
    article['issaved'] = article['isSaved']
    article.pop('isSaved')
  if 'isLiked' in article:
    article['isliked'] = article['isLiked']
    article.pop('isLiked')
  if 'isRead' in article:
    article['isread'] = article['isRead']
    article.pop('isRead')
  if 'feedUrl' in article:
    article['feedurl'] = article['feedUrl']
    article.pop('feedUrl')
  if 'content' in article:
    article['textcontent'] = article['content']
    article.pop('content')

  # Check the lit-feed-dev-article-models bucket for the model
  boto3.setup_default_session()
  s3 = boto3.client('s3')
  shouldLoadFromScratch = True
  if not is_test_run:
    print('Loading pipeline')
    try:
      if os.path.exists(pipeline_full_filename):
        if os.path.exists(pipeline_full_filename) and (time.time() - os.path.getmtime(pipeline_full_filename)) < 1800:
          print("Pipeline in /tmp is less than half hour old, skipping training")
          return {
            'statusCode': 200,
            'body': json.dumps('Training is already done less than half hour ago, skipping')
          }
        pipeline = joblib.load(pipeline_full_filename)
        print("Pipeline loaded from /tmp")
      else:
        key = f'{userId}/{pipeline_filename}'
        # If S3 file is created less than half hour ago skip training
        if (time.time() - s3.head_object(Bucket=bucket_name, Key=key)['LastModified'].timestamp()) < 1800:
          print("Pipeline in S3 is less than half hour old, skipping training")
          return {
            'statusCode': 200,
            'body': json.dumps('Training is already done less than half hour ago, skipping')
          }
        s3.download_file(bucket_name, key, pipeline_full_filename)
        pipeline = joblib.load(pipeline_full_filename)
        print("pipeline loaded from s3")
      shouldLoadFromScratch = False
    except:
      print('Pipeline will have to be created from scratch')
  else:
    print('Running locally, training will be done from scratch')
  
  if shouldLoadFromScratch:
    if is_test_run and os.path.exists(athena_cache_full_filename):
      data = pd.read_csv(athena_cache_full_filename)
      print('loaded data from local athena cache')
    else:
      print('Loading training data from Athena')
      query = f"select distinct b.link, u.title, b.tags, b.textcontent, u.userid, u.issaved, u.isliked, u.isread, b.summary, u.feedurl from default.user_articles u join default.backend_articles b on u.href = b.link where u.userId = '{userId}'"
      data = wr.athena.read_sql_query(query, database='default')
      data.to_csv(athena_cache_full_filename, index=False)
      print('loaded data from Athena')
  else:
    print('Training data loaded from the event')
    data = pd.DataFrame([article])

  data['textcontent'] = data['textcontent'].fillna('').astype(str)
  data['tags'] = data['tags'].fillna('').astype(str)
  data['summary'] = data['summary'].fillna('').astype(str)

  if is_test_run:
    print(f"Testing sample fraction: {testing_sample_fraction}")
    data_for_testing = data.sample(frac=testing_sample_fraction)
    data = data.drop(data_for_testing.index)

  y = data['isliked'].apply(lambda x: 0 if pd.isna(x) or x == None else 1 if x else -1)
  # If issaved is True, set y to 1
  y = y.where(data['issaved'] == False, 1) # change to 1 if saved is true

  print('Starting the training with the following outputs')
  y_equal_1 = y[y == 1]
  y_equal_0 = y[y == 0]
  y_equal_m1 = y[y == -1]
  print(f"y = 1: {len(y_equal_1)}")
  print(f"y = 0: {len(y_equal_0)}")
  print(f"y = -1: {len(y_equal_m1)}")

  classes = [-1, 0, 1]  # Ensure all classes are represented in the partial_fit call
  if shouldLoadFromScratch:
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
    numpy_classes = np.array(classes)
    class_weights = compute_class_weight(class_weight='balanced', classes=numpy_classes, y=y)
    class_weights_dict = dict(zip(numpy_classes, class_weights))
    class_weights_dict[-1] *= dislike_bias
    class_weights_dict[1] *= like_bias
    class_weights_dict[0] *= neutral_bias
    print(f"Class weights: {class_weights_dict}")
    sgd_classifier = SGDClassifier(loss='modified_huber', class_weight=class_weights_dict)
    pipeline = Pipeline([
      ('preprocessor', preprocessor),
      ('classifier', sgd_classifier)
    ])
    print('pipeline created from scratch')

    # Oversampling
    print("Starting oversampling")
    ros = RandomOverSampler(sampling_strategy='auto')
    data_resampled, y_resampled = ros.fit_resample(data, y)

    pipeline.fit(data_resampled, y_resampled)
  else:
    preprocessor = pipeline.named_steps['preprocessor']
    classifier = pipeline.named_steps['classifier']

    X_transformed = preprocessor.transform(data)

    classifier.partial_fit(X_transformed, y, classes=classes)

  if is_test_run:
    liked_articles = data_for_testing[data_for_testing['isliked'] == True]
    liked_articles_predictions = pipeline.predict(liked_articles)
    wrong_liked_articles_predictions = (liked_articles_predictions != 1).sum()
    num_of_liked_articles = len(liked_articles)
    print(f"Number of wrong predictions for liked articles: {wrong_liked_articles_predictions/num_of_liked_articles} {wrong_liked_articles_predictions}/{num_of_liked_articles}")
    disliked_articles = data_for_testing[data_for_testing['isliked'] == False]
    disliked_articles_predictions = pipeline.predict(disliked_articles)
    wrong_disliked_articles_predictions = (disliked_articles_predictions != -1).sum()
    num_of_disliked_articles = len(disliked_articles)
    print(f"Number of wrong predictions for disliked articles: {wrong_disliked_articles_predictions/num_of_disliked_articles} {wrong_disliked_articles_predictions}/{num_of_disliked_articles}")
    neutral_articles = data_for_testing[data_for_testing['isliked'].isna()]
    neutral_articles_predictions = pipeline.predict(neutral_articles)
    wrong_neutral_articles_predictions = (neutral_articles_predictions != 0).sum()
    num_of_neutral_articles = len(neutral_articles)
    print(f"Number of wrong predictions for neutral articles: {wrong_neutral_articles_predictions/num_of_neutral_articles} {wrong_neutral_articles_predictions}/{num_of_neutral_articles}")

  # Save the model and vectorizer back to S3
  print('Saving the data in S3')
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
        'y = 1': len(y_equal_1),
        'y = 0': len(y_equal_0),
        'y = -1': len(y_equal_m1)
      }
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