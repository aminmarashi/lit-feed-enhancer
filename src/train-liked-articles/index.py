#! /usr/bin/env python3
import time
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
from sklearn.utils.class_weight import compute_class_weight
from imblearn.over_sampling import RandomOverSampler
from custom_transformers import OrderedTagVectorizer
from sklearn.linear_model import SGDClassifier

## TODO: Make these env vars
pipeline_filename = 'complete_pipeline.joblib'
athena_cache_filename = 'athena_cache.csv'
lambda_tmp_dir = '/tmp'
bucket_name = os.environ.get('TRAINING_DATA_BUCKET_NAME', 'lit-feed-dev-article-training-data')
is_test_run = os.environ.get('TEST_RUN', 'False') == 'True'
testing_sample_fraction = float(os.environ.get('TESTING_SAMPLE_FRACTION', '0.2'))
like_bias = float(os.environ.get('LIKE_BIAS', '1'))
dislike_bias = float(os.environ.get('DISLIKE_BIAS', '1'))
neutral_bias = float(os.environ.get('NEUTRAL_BIAS', '1'))
print(f"Biased by: like: {like_bias}, dislike: {dislike_bias}, neutral: {neutral_bias}")

def count_disliked_articles(articles, article_probabilities):
  disliked_articles = 0
  # Iterate over all articles and find the articles for which corresponding article_probabilities[0] > 0.33
  for i in range(len(articles)):
    if article_probabilities[i][0] > 0.33:
      disliked_articles += 1
  return disliked_articles
def handler(event, context):
  print(f'Event: {event}')
  article = event
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
  if not 'tags' in article:
    article['tags'] = []

  # Check the lit-feed-dev-article-models bucket for the model
  boto3.setup_default_session()
  s3 = boto3.client('s3')
  shouldLoadFromScratch = True
  if not is_test_run:
    print('Loading pipeline')
    try:
      # TODO: Move the function call to SQS queue so that we don't lose articles due to race conditions
      # It takes each lambda 7 seconds to finish, and if another training is done during that time one
      # it will override the result
      if os.path.exists(pipeline_full_filename):
        pipeline = joblib.load(pipeline_full_filename)
        print("Pipeline loaded from /tmp")
      else:
        key = f'{userId}/{pipeline_filename}'
        s3.download_file(bucket_name, key, pipeline_full_filename)
        pipeline = joblib.load(pipeline_full_filename)
        print("pipeline loaded from s3")
      shouldLoadFromScratch = False
    except Exception as e:
      print('Pipeline will have to be created from scratch' + str(e))
  else:
    print('Running locally, training will be done from scratch')
  
  if shouldLoadFromScratch:
    if os.path.exists(athena_cache_full_filename):
      data = pd.read_csv(athena_cache_full_filename)
      print('loaded data from local athena cache')
    elif check_file_exists_in_s3(s3, Bucket=bucket_name, Key=athena_cache_in_s3):
      print('Loading training data from S3')
      s3.download_file(bucket_name, athena_cache_in_s3, athena_cache_full_filename)
      data = pd.read_csv(athena_cache_full_filename)
      print('loaded data from S3 athena cache')
    else:
      print('Loading training data from Athena')
      query = f"select distinct u.title, b.tags, u.userid, u.issaved, u.isliked, b.summary from default.user_articles u join default.backend_articles b on u.href = b.link where u.userId = '{userId}'"
      data = wr.athena.read_sql_query(query, database='default')
      data.to_csv(athena_cache_full_filename, index=False)
      print('Storing Athena results in S3')
      s3.upload_file(athena_cache_full_filename, bucket_name, athena_cache_in_s3)
      print('loaded data from Athena')
  else:
    print('Training data loaded from the event')
    data = pd.DataFrame([article])

  data['tags'] = data['tags'].apply(lambda x: x if isinstance(x, (list, np.ndarray)) else [])
  data['summary'] = data['summary'].fillna('').astype(str)

  if is_test_run:
    print(f"Testing sample fraction: {testing_sample_fraction}")
    data_for_testing = data.sample(frac=testing_sample_fraction)
    data = data.drop(data_for_testing.index)

  y = data['isliked'].apply(lambda x: 0 if pd.isna(x) or x == None else 1 if x else -1)
  # If issaved is True, set y to 1
  y = y.where(data['issaved'] == False, 1) # change to 1 if saved is true

  # Delete all columns from data except for title, summary and tags
  all_data_columns = data.columns
  for column in all_data_columns:
    if column not in ['title', 'summary', 'tags']:
      data = data.drop(column, axis=1)

  classes = [-1, 0, 1]  # Ensure all classes are represented in the partial_fit call

  if shouldLoadFromScratch:
    if len(y[y == -1]) == 0:
      print("No disliked articles, moving one from neutral to disliked")
      y.iloc[0] = -1
    if len(y[y == 1]) == 0:
      print("No liked articles, moving one from neutral to liked")
      y.iloc[0] = 1

  print('Starting the training with the following outputs')
  y_equal_1 = y[y == 1]
  y_equal_0 = y[y == 0]
  y_equal_m1 = y[y == -1]
  print(f"y = 1: {len(y_equal_1)}")
  print(f"y = 0: {len(y_equal_0)}")
  print(f"y = -1: {len(y_equal_m1)}")

  if shouldLoadFromScratch:
    preprocessor = ColumnTransformer(
      transformers=[
        ('title', TfidfVectorizer(max_features=10000, max_df=0.7, ngram_range=(1, 5)), 'title'),
        ('summary', TfidfVectorizer(max_features=1000000, max_df=0.7, ngram_range=(1, 5)), 'summary'), 
        ('tags', OrderedTagVectorizer(), 'tags'),
      ]
    )
    numpy_classes = np.array(classes)
    class_weights = compute_class_weight(class_weight='balanced', classes=numpy_classes, y=y)
    class_weights_dict = dict(zip(numpy_classes, class_weights))
    class_weights_dict[-1] *= dislike_bias
    class_weights_dict[1] *= like_bias
    class_weights_dict[0] *= neutral_bias
    print(f"Class weights: {class_weights_dict}")
    classifier = SGDClassifier(loss='log_loss', penalty='elasticnet', alpha=0.0001, l1_ratio=0.15,
                        learning_rate='adaptive', eta0=0.01,
                        validation_fraction=0.1, n_iter_no_change=5, random_state=42)

    pipeline = Pipeline([
      ('preprocessor', preprocessor),
      ('classifier', classifier)
    ])
    print('pipeline created from scratch')

    # Oversampling
    print("Starting oversampling")
    ros = RandomOverSampler(sampling_strategy='auto')
    data_resampled, y_resampled = ros.fit_resample(data, y)

    pipeline.fit(data_resampled, y_resampled)

    print("Shape of data_resampled:", data_resampled.shape)
    print("Shape of y_resampled:", y_resampled.shape)

  else:
    preprocessor = pipeline.named_steps['preprocessor']
    classifier = pipeline.named_steps['classifier']

    X_transformed = preprocessor.transform(data)

    classifier.partial_fit(X_transformed, y, classes=classes)

  if is_test_run:
    articles_is_liked = data_for_testing[data_for_testing['isliked'] == True]
    articles_is_saved = data_for_testing[data_for_testing['issaved'] == True]
    # liked_articles is appended of articles_is_liked and articles_is_saved
    liked_articles = pd.concat([articles_is_liked, articles_is_saved])
    liked_articles_probabilities = pipeline.predict_proba(liked_articles)
    predicted_disliked_articles = count_disliked_articles(liked_articles, liked_articles_probabilities)
    print(f'Wrongly identified liked articles: {predicted_disliked_articles} from {len(liked_articles)}')
    article_is_disliked = data_for_testing[data_for_testing['isliked'] == False]
    article_is_disliked_probabilities = pipeline.predict_proba(article_is_disliked)
    predicted_disliked_articles = count_disliked_articles(article_is_disliked, article_is_disliked_probabilities)
    print(f'Wrongly identified disliked articles: {len(article_is_disliked) - predicted_disliked_articles} from {len(article_is_disliked)}')
    neutral_articles = data_for_testing[data_for_testing['isliked'].isna()]
    neutral_articles_probabilities = pipeline.predict_proba(neutral_articles)
    predicted_disliked_articles = count_disliked_articles(neutral_articles, neutral_articles_probabilities)
    print(f'Wrongly identified neutral articles: {predicted_disliked_articles} from {len(neutral_articles)}')

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
    'userId': 'localhostUser',
    'tags': None,
    'openDuration': 8578928
  }, None)
  print(result)

def check_file_exists_in_s3(s3, Bucket, Key):
  try:
    s3.head_object(Bucket=Bucket, Key=Key)
    return True
  except:
    return False